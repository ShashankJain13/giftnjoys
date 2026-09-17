variable "environment" {
  type    = string
  default = "dev"
}

variable "region" {
  type    = string
  default = "ap-south-1"
}

variable "aws_profile" {
  type    = string
  default = "giftnjoys-dev"
}

variable "account_id" {
  description = "Guard rail: Terraform refuses to run against any other account"
  type        = string
  default     = "637423417590"
}

variable "upload_allowed_origins" {
  description = "Admin panel origins allowed to upload images/exports directly to S3"
  type        = list(string)
  default     = ["http://localhost:5173"]
}

variable "create_imports_bucket" {
  type    = bool
  default = true
}
