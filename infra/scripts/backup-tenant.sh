#!/usr/bin/env bash
# backup-tenant.sh — Per-tenant schema backup to DigitalOcean Spaces
#
# Usage:
#   ./backup-tenant.sh --slug acme
#   ./backup-tenant.sh --all                  # backup every tenant
#   ./backup-tenant.sh --slug acme --restore  # restore from latest backup
#
# Required environment variables:
#   DATABASE_URL          PostgreSQL connection string
#   DO_SPACES_KEY         DigitalOcean Spaces access key
#   DO_SPACES_SECRET      DigitalOcean Spaces secret key
#   DO_SPACES_BUCKET      e.g. gadnuc-media
#   DO_SPACES_REGION      e.g. nyc3
#
# Optional:
#   BACKUP_RETENTION_DAYS  How many days to keep backups (default: 30)
#   BACKUP_PASSPHRASE      GPG passphrase for encryption (highly recommended)

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────

RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
S3_ENDPOINT="https://${DO_SPACES_REGION:-nyc3}.digitaloceanspaces.com"
S3_BUCKET="${DO_SPACES_BUCKET:-gadnuc-backups}"
BACKUP_PREFIX="backups/tenants"
WORK_DIR="$(mktemp -d)"
SLUG=""
DO_ALL=false
DO_RESTORE=false

# ── Argument parsing ──────────────────────────────────────────────────────────

usage() {
  echo "Usage: $0 [--slug SLUG | --all] [--restore]"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --slug)    SLUG="$2";     shift 2 ;;
    --all)     DO_ALL=true;   shift   ;;
    --restore) DO_RESTORE=true; shift ;;
    *)         usage ;;
  esac
done

[[ -z "$SLUG" && "$DO_ALL" == false ]] && usage

# ── Helpers ───────────────────────────────────────────────────────────────────

log()  { echo "[$(date -u +%H:%M:%S)] $*"; }
die()  { echo "ERROR: $*" >&2; exit 1; }

require_cmd() {
  command -v "$1" &>/dev/null || die "'$1' not found in PATH"
}

require_cmd pg_dump
require_cmd pg_restore
require_cmd aws          # awscli v2 — used for Spaces (S3-compatible)

# Configure AWS CLI for DO Spaces
export AWS_ACCESS_KEY_ID="${DO_SPACES_KEY:?DO_SPACES_KEY is required}"
export AWS_SECRET_ACCESS_KEY="${DO_SPACES_SECRET:?DO_SPACES_SECRET is required}"
AWS_S3="aws s3 --endpoint-url=${S3_ENDPOINT}"

# ── Backup a single tenant schema ─────────────────────────────────────────────

backup_slug() {
  local slug="$1"
  local schema="tenant_${slug}"
  local filename="${slug}_${TIMESTAMP}.dump"
  local filepath="${WORK_DIR}/${filename}"
  local s3_key="${BACKUP_PREFIX}/${slug}/${filename}"

  log "Backing up schema: ${schema}"

  # Dump only the tenant schema in custom format (compressed, parallel-restore capable)
  pg_dump \
    --dbname="${DATABASE_URL:?DATABASE_URL is required}" \
    --schema="${schema}" \
    --format=custom \
    --compress=9 \
    --no-owner \
    --no-acl \
    --file="${filepath}"

  local dump_size
  dump_size="$(du -sh "${filepath}" | cut -f1)"
  log "Dump complete: ${dump_size} → ${filepath}"

  # Optional GPG encryption
  local upload_path="${filepath}"
  if [[ -n "${BACKUP_PASSPHRASE:-}" ]]; then
    require_cmd gpg
    gpg --batch --yes \
        --passphrase "${BACKUP_PASSPHRASE}" \
        --symmetric \
        --cipher-algo AES256 \
        --output "${filepath}.gpg" \
        "${filepath}"
    rm -f "${filepath}"
    upload_path="${filepath}.gpg"
    s3_key="${s3_key}.gpg"
    log "Encrypted: ${upload_path}"
  fi

  # Upload to DO Spaces
  log "Uploading to s3://${S3_BUCKET}/${s3_key}"
  ${AWS_S3} cp \
    "${upload_path}" \
    "s3://${S3_BUCKET}/${s3_key}" \
    --storage-class STANDARD \
    --no-progress

  log "✓ Backup complete: ${slug} → ${s3_key}"

  # Write latest-pointer file for easy restore discovery
  echo "${s3_key}" | ${AWS_S3} cp - \
    "s3://${S3_BUCKET}/${BACKUP_PREFIX}/${slug}/latest.txt"
}

# ── Restore a single tenant schema ────────────────────────────────────────────

restore_slug() {
  local slug="$1"
  local latest_key
  latest_key="$(${AWS_S3} cp \
    "s3://${S3_BUCKET}/${BACKUP_PREFIX}/${slug}/latest.txt" - 2>/dev/null \
    | tr -d '[:space:]')" \
    || die "No latest backup found for tenant: ${slug}"

  local filename
  filename="$(basename "${latest_key}")"
  local filepath="${WORK_DIR}/${filename}"

  log "Downloading: s3://${S3_BUCKET}/${latest_key}"
  ${AWS_S3} cp "s3://${S3_BUCKET}/${latest_key}" "${filepath}"

  # Decrypt if GPG-encrypted
  if [[ "${filepath}" == *.gpg ]]; then
    [[ -z "${BACKUP_PASSPHRASE:-}" ]] && die "BACKUP_PASSPHRASE required to decrypt backup"
    require_cmd gpg
    local decrypted="${filepath%.gpg}"
    gpg --batch --yes \
        --passphrase "${BACKUP_PASSPHRASE}" \
        --output "${decrypted}" \
        --decrypt "${filepath}"
    rm -f "${filepath}"
    filepath="${decrypted}"
  fi

  log "Restoring schema tenant_${slug} from ${filepath}"
  pg_restore \
    --dbname="${DATABASE_URL}" \
    --schema="tenant_${slug}" \
    --no-owner \
    --no-acl \
    --clean \
    --if-exists \
    "${filepath}"

  log "✓ Restore complete: tenant_${slug}"
}

# ── Prune old backups (beyond retention window) ───────────────────────────────

prune_old_backups() {
  local slug="$1"
  local cutoff
  cutoff="$(date -u -d "${RETENTION_DAYS} days ago" +%Y%m%dT%H%M%SZ 2>/dev/null \
            || date -u -v-"${RETENTION_DAYS}"d +%Y%m%dT%H%M%SZ)"  # macOS fallback

  log "Pruning backups older than ${RETENTION_DAYS} days for: ${slug}"
  ${AWS_S3} ls "s3://${S3_BUCKET}/${BACKUP_PREFIX}/${slug}/" \
    | awk '{print $4}' \
    | grep -E '\.dump(\.gpg)?$' \
    | while read -r key; do
        local ts
        ts="$(echo "${key}" | grep -oE '[0-9]{8}T[0-9]{6}Z')"
        if [[ -n "${ts}" && "${ts}" < "${cutoff}" ]]; then
          log "  Deleting old backup: ${key}"
          ${AWS_S3} rm "s3://${S3_BUCKET}/${BACKUP_PREFIX}/${slug}/${key}"
        fi
      done
}

# ── Discover all tenant slugs from the DB ─────────────────────────────────────

get_all_slugs() {
  psql "${DATABASE_URL}" -t -A \
    -c "SELECT slug FROM public.tenants WHERE status NOT IN ('cancelled') ORDER BY slug"
}

# ── Entry point ───────────────────────────────────────────────────────────────

cleanup() { rm -rf "${WORK_DIR}"; }
trap cleanup EXIT

if [[ "$DO_RESTORE" == true ]]; then
  restore_slug "${SLUG}"
elif [[ "$DO_ALL" == true ]]; then
  slugs="$(get_all_slugs)"
  if [[ -z "${slugs}" ]]; then
    log "No active tenants found."
    exit 0
  fi
  while IFS= read -r s; do
    backup_slug "${s}"
    prune_old_backups "${s}"
  done <<< "${slugs}"
  log "✓ All tenant backups complete"
else
  backup_slug "${SLUG}"
  prune_old_backups "${SLUG}"
fi
