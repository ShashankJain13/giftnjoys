# Mirrors packages/core/src/db/table-definitions.ts — keep both in sync.

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.65"
    }
  }
}

variable "table_prefix" {
  description = "e.g. gnj-dev (the app derives table names as gnj-<APP_ENV>-<name>)"
  type        = string
}

variable "point_in_time_recovery" {
  type    = bool
  default = true
}

variable "deletion_protection" {
  type    = bool
  default = false
}

locals {
  tables = {
    products = {
      hash       = "id"
      attributes = ["id", "status", "updatedAt", "importJobId", "createdAt", "sourceHash"]
      gsis = [
        { name = "byStatus", hash = "status", range = "updatedAt" },
        { name = "byImportJob", hash = "importJobId", range = "createdAt" },
        { name = "bySourceHash", hash = "sourceHash", range = null },
      ]
      ttl = null
    }
    categories = { hash = "id", attributes = ["id"], gsis = [], ttl = null }
    orders = {
      hash       = "orderNumber"
      attributes = ["orderNumber", "status", "createdAt", "customerPhone", "accountId"]
      gsis = [
        { name = "byStatus", hash = "status", range = "createdAt" },
        { name = "byPhone", hash = "customerPhone", range = "createdAt" },
        { name = "byAccount", hash = "accountId", range = "createdAt" },
      ]
      ttl = null
    }
    import-jobs = {
      hash       = "id"
      attributes = ["id", "kind", "createdAt"]
      gsis       = [{ name = "byCreatedAt", hash = "kind", range = "createdAt" }]
      ttl        = null
    }
    settings = { hash = "key", attributes = ["key"], gsis = [], ttl = null }
    meta     = { hash = "pk", attributes = ["pk"], gsis = [], ttl = "expiresAt" }
    accounts = {
      hash       = "id"
      attributes = ["id", "email"]
      gsis       = [{ name = "byEmail", hash = "email", range = null }]
      ttl        = null
    }
  }
}

resource "aws_dynamodb_table" "this" {
  for_each = local.tables

  name                        = "${var.table_prefix}-${each.key}"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = each.value.hash
  deletion_protection_enabled = var.deletion_protection

  dynamic "attribute" {
    for_each = each.value.attributes
    content {
      name = attribute.value
      type = "S"
    }
  }

  dynamic "global_secondary_index" {
    for_each = each.value.gsis
    content {
      name            = global_secondary_index.value.name
      hash_key        = global_secondary_index.value.hash
      range_key       = global_secondary_index.value.range
      projection_type = "ALL"
    }
  }

  dynamic "ttl" {
    for_each = each.value.ttl == null ? [] : [each.value.ttl]
    content {
      attribute_name = ttl.value
      enabled        = true
    }
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery
  }

  server_side_encryption {
    enabled = true
  }
}

output "table_arns" {
  value = [for t in aws_dynamodb_table.this : t.arn]
}

output "table_and_index_arns" {
  value = flatten([for t in aws_dynamodb_table.this : [t.arn, "${t.arn}/index/*"]])
}

output "table_names" {
  value = { for k, t in aws_dynamodb_table.this : k => t.name }
}
