terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.65"
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

module "media_cdn" {
  source = "../../modules/media-cdn"

  name_prefix            = "giftnjoys-${var.environment}"
  upload_allowed_origins = var.upload_allowed_origins
  create_imports_bucket  = var.create_imports_bucket
}
