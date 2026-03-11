# Gadnuc — Multi-Tenant SaaS Platform

A fully featured, production-ready SaaS platform monorepo. Each customer (tenant) gets their own isolated data, branded storefront, and internal workspace.

## Architecture

```
gadnuc/
├── apps/
│   ├── inventory-server/     Node.js/Express — Multi-tenant inventory & orders API (port 3001)
│   ├── server-manager/       Node.js/Express — SuperAdmin management API (port 3002)
│   └── storefront/           Next.js 14 — Per-tenant SSR storefront (port 3000)
│
├── packages/
│   ├── @gadnuc/auth          JWT signing/verification + RBAC middleware
│   ├── @gadnuc/db            PostgreSQL pool + schema-per-tenant isolation
│   ├── @gadnuc/tenant        Tenant resolution from subdomain/custom domain
│   └── @gadnuc/feature-flags Feature flag system with percentage rollout
│
└── infra/
    ├── terraform/            DigitalOcean infrastructure as code
    └── k8s/                  Kubernetes manifests (DOKS)
```

## Key Features

- **Multi-tenancy** — Schema-per-tenant PostgreSQL isolation; tenant resolved from subdomain (`acme.gadnuc.io`) or custom domain (`acme.com`)
- **Security-first** — JWT access tokens (15 min) + rotating refresh tokens, RBAC, Zod input validation, parameterized queries, Helmet headers
- **Feature flags** — Per-tenant flags with percentage rollout; plan-gated features
- **Storefront** — SSR Next.js 14 storefront with per-tenant theming, product catalog, Stripe checkout
- **Stripe billing** — Subscription management with webhook handling for lifecycle events
- **CI/CD** — GitHub Actions: typecheck → lint → test → security scan → build Docker images → deploy to DigitalOcean App Platform
- **Infrastructure as code** — Terraform for DO managed PostgreSQL, Redis, Spaces, CDN, and App Platform

## Roles

| Role          | Description                                      |
|---------------|--------------------------------------------------|
| `super_admin` | Platform-level — manages all tenants             |
| `tenant_admin`| Full control within a single tenant             |
| `operator`    | Can create/edit products, orders, filaments      |
| `viewer`      | Read-only access                                 |

## Tenant Onboarding Flow

1. `POST /api/tenants` (server-manager) — creates tenant record + provisions `tenant_<slug>` schema
2. Subdomain `slug.gadnuc.io` resolves automatically
3. Tenant admin completes setup wizard → storefront goes live

## Quick Start (Local Development)

```bash
# 1. Prerequisites: Node 20+, PostgreSQL 15, Redis 7

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your local DB credentials and JWT_SECRET

# 4. Run database migrations
npm run migrate

# 5. Start all services
npm run dev
```

Services will be available at:
- **Storefront**: http://localhost:3000
- **Inventory API**: http://localhost:3001
- **Server Manager API**: http://localhost:3002

## Environment Variables

See `.env.example` for all required variables with descriptions.

## Deployment

Infrastructure is managed with Terraform (DigitalOcean). See `infra/terraform/` for the full spec.

```bash
cd infra/terraform
terraform init
terraform plan -var="do_token=$DO_TOKEN"
terraform apply
```

GitHub Actions deploys automatically on push to `main`. Required secrets:
- `DO_TOKEN` — DigitalOcean API token
- `DO_APP_ID` — App Platform app ID

## Phase Roadmap

Based on the SaaS Transformation Roadmap:

- [x] **Phase 1** — Multi-tenancy, JWT auth, RBAC, Zod validation
- [x] **Phase 2** — Schema-per-tenant DB isolation, migration runner
- [x] **Phase 3** — Next.js storefront with per-tenant theming + Stripe
- [ ] **Phase 4** — Matrix/Synapse messaging integration
- [ ] **Phase 5** — Full feature flag UI, Stripe Connect, Grafana monitoring

## Security Notes

- Never commit `.env` — use `DO_APP_PLATFORM` env vars or Vault
- JWT secret must be ≥ 32 characters; rotate quarterly
- All API inputs validated with Zod before reaching the database
- All DB queries use parameterized statements (zero raw SQL interpolation)
- Tenant schemas are isolated at the PostgreSQL schema level
