terraform {
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
  }
  backend "s3" {
    # DigitalOcean Spaces as Terraform backend
    endpoint = "https://nyc3.digitaloceanspaces.com"
    region   = "us-east-1"  # Required by S3-compatible API; not the actual region
    bucket   = "gadnuc-terraform-state"
    key      = "production/terraform.tfstate"
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    force_path_style            = true
  }
}

provider "digitalocean" {
  token = var.do_token
}

# ─── VPC ────────────────────────────────────────────────────────────────────
resource "digitalocean_vpc" "main" {
  name     = "gadnuc-vpc"
  region   = var.region
  ip_range = "10.10.0.0/16"
}

# ─── Managed PostgreSQL ──────────────────────────────────────────────────────
resource "digitalocean_database_cluster" "postgres" {
  name                 = "gadnuc-postgres"
  engine               = "pg"
  version              = "15"
  size                 = var.db_size
  region               = var.region
  node_count           = 2          # Primary + standby for HA
  private_network_uuid = digitalocean_vpc.main.id

  maintenance_window {
    day  = "sunday"
    hour = "02:00:00"
  }
}

resource "digitalocean_database_firewall" "postgres" {
  cluster_id = digitalocean_database_cluster.postgres.id

  rule {
    type  = "app"
    value = digitalocean_app.gadnuc.id
  }
}

# ─── Managed Redis ───────────────────────────────────────────────────────────
resource "digitalocean_database_cluster" "redis" {
  name                 = "gadnuc-redis"
  engine               = "redis"
  version              = "7"
  size                 = "db-s-1vcpu-1gb"
  region               = var.region
  node_count           = 1
  private_network_uuid = digitalocean_vpc.main.id
}

# ─── DigitalOcean Spaces (object storage) ───────────────────────────────────
resource "digitalocean_spaces_bucket" "media" {
  name   = "gadnuc-media"
  region = var.region
  acl    = "private"

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = ["https://*.gadnuc.io"]
    max_age_seconds = 3600
  }
}

resource "digitalocean_cdn" "media" {
  origin = digitalocean_spaces_bucket.media.bucket_domain_name
  ttl    = 3600
}

# ─── App Platform ────────────────────────────────────────────────────────────
resource "digitalocean_app" "gadnuc" {
  spec {
    name   = "gadnuc"
    region = var.region

    # inventory-server
    service {
      name               = "inventory-server"
      instance_count     = var.inventory_instances
      instance_size_slug = var.app_size

      image {
        registry_type = "DOCR"
        registry      = "gadnuc"
        repository    = "inventory-server"
        tag           = "latest"
      }

      http_port = 3001
      health_check {
        http_path             = "/health"
        initial_delay_seconds = 15
        period_seconds        = 30
        failure_threshold     = 3
      }

      env {
        key   = "DATABASE_URL"
        value = digitalocean_database_cluster.postgres.private_uri
        type  = "SECRET"
      }
      env {
        key   = "REDIS_URL"
        value = digitalocean_database_cluster.redis.private_uri
        type  = "SECRET"
      }
      env { key = "NODE_ENV";         value = "production" }
      env { key = "PLATFORM_DOMAIN";  value = var.platform_domain }
    }

    # server-manager
    service {
      name               = "server-manager"
      instance_count     = 1
      instance_size_slug = var.app_size

      image {
        registry_type = "DOCR"
        registry      = "gadnuc"
        repository    = "server-manager"
        tag           = "latest"
      }

      http_port = 3002
      health_check { http_path = "/health" }

      env {
        key   = "DATABASE_URL"
        value = digitalocean_database_cluster.postgres.private_uri
        type  = "SECRET"
      }
    }

    # storefront
    service {
      name               = "storefront"
      instance_count     = var.storefront_instances
      instance_size_slug = var.app_size

      image {
        registry_type = "DOCR"
        registry      = "gadnuc"
        repository    = "storefront"
        tag           = "latest"
      }

      http_port = 3000
      health_check { http_path = "/health" }

      env { key = "INVENTORY_SERVER_URL"; value = "http://inventory-server:3001" }
      env { key = "PLATFORM_DOMAIN";       value = var.platform_domain }
    }

    domain {
      name = var.platform_domain
      type = "PRIMARY"
    }
    domain {
      name = "*.${var.platform_domain}"
      type = "ALIAS"
    }
  }
}

# ─── Container Registry ──────────────────────────────────────────────────────
resource "digitalocean_container_registry" "gadnuc" {
  name                   = "gadnuc"
  subscription_tier_slug = "basic"
  region                 = var.region
}
