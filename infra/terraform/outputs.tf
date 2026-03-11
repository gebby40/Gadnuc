output "postgres_uri" {
  description = "PostgreSQL connection URI (private VPC)"
  value       = digitalocean_database_cluster.postgres.private_uri
  sensitive   = true
}

output "redis_uri" {
  description = "Redis connection URI (private VPC)"
  value       = digitalocean_database_cluster.redis.private_uri
  sensitive   = true
}

output "spaces_bucket_domain" {
  description = "DigitalOcean Spaces bucket domain"
  value       = digitalocean_spaces_bucket.media.bucket_domain_name
}

output "cdn_endpoint" {
  description = "CDN endpoint for media assets"
  value       = digitalocean_cdn.media.endpoint
}

output "registry_endpoint" {
  description = "Container registry endpoint"
  value       = digitalocean_container_registry.gadnuc.endpoint
}

output "app_live_url" {
  description = "App Platform live URL"
  value       = digitalocean_app.gadnuc.live_url
}
