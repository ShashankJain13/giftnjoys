terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.65"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.9"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.8"
    }
  }
}

provider "aws" {
  region              = var.region
  profile             = var.aws_profile
  allowed_account_ids = [var.account_id]

  default_tags {
    tags = {
      Project     = "giftnjoys"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

locals {
  name         = "giftnjoys-${var.environment}"
  table_prefix = "gnj-${var.environment}"
}

module "media_cdn" {
  source = "../../modules/media-cdn"

  name_prefix            = local.name
  upload_allowed_origins = concat([module.admin_site.url], var.local_admin_origins)
  create_imports_bucket  = var.create_imports_bucket
}
