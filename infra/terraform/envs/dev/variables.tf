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

variable "admin_email" {
  description = "SES sender, order-alert and budget-alert recipient, seeded admin login (set in terraform.tfvars, not committed)"
  type        = string
}

variable "create_imports_bucket" {
  type    = bool
  default = true
}

variable "local_public_origins" {
  description = "Extra CORS origins for the public API (local storefront dev against AWS)"
  type        = list(string)
  default     = ["http://localhost:3000"]
}

variable "local_admin_origins" {
  description = "Extra CORS/upload origins for the admin API and buckets (local admin dev against AWS)"
  type        = list(string)
  default     = ["http://localhost:5173"]
}

variable "github_repository" {
  type    = string
  default = "ShashankJain13/giftnjoys"
}

variable "monthly_budget_usd" {
  description = "AWS Budgets alert threshold (email at 80% actual and 100% forecast)"
  type        = string
  default     = "10"
}
