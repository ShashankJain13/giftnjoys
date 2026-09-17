variable "name_prefix" {
  description = "Prefix for resource names, e.g. giftnjoys-dev"
  type        = string
}

variable "upload_allowed_origins" {
  description = "Browser origins allowed to upload directly to the buckets with presigned POST (admin panel URLs)"
  type        = list(string)
}

variable "create_imports_bucket" {
  description = "Also create the private bucket for WhatsApp chat export uploads"
  type        = bool
  default     = true
}

variable "imports_expiration_days" {
  description = "Uploaded chat exports are deleted after this many days"
  type        = number
  default     = 30
}

variable "noncurrent_version_expiration_days" {
  description = "Overwritten/deleted media versions are kept this long (accidental delete protection)"
  type        = number
  default     = 30
}

variable "price_class" {
  description = "PriceClass_200 includes edge locations in India"
  type        = string
  default     = "PriceClass_200"
}
