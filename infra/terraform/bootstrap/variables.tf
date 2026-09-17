variable "region" {
  type    = string
  default = "ap-south-1"
}

variable "aws_profile" {
  description = "AWS CLI profile to use"
  type        = string
  default     = "giftnjoys-dev"
}

variable "account_id" {
  description = "Guard rail: Terraform refuses to run against any other account"
  type        = string
  default     = "637423417590"
}
