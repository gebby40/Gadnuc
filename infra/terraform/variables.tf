variable "do_token" {
  description = "DigitalOcean API token"
  type        = string
  sensitive   = true
}

variable "region" {
  description = "DigitalOcean region"
  type        = string
  default     = "nyc3"
}

variable "platform_domain" {
  description = "Platform root domain (e.g. gadnuc.com)"
  type        = string
  default     = "gadnuc.com"
}

variable "db_size" {
  description = "PostgreSQL cluster node size"
  type        = string
  default     = "db-s-2vcpu-4gb"
}

variable "app_size" {
  description = "App Platform instance size slug"
  type        = string
  default     = "professional-xs"
}

variable "inventory_instances" {
  description = "Number of inventory-server replicas"
  type        = number
  default     = 2
}

variable "storefront_instances" {
  description = "Number of storefront replicas"
  type        = number
  default     = 2
}
