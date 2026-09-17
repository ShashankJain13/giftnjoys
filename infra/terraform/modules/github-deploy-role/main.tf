# Lets GitHub Actions deploy application code via OIDC — no long-lived AWS keys stored in GitHub.
# Scope: update Lambda code, sync the two site buckets, invalidate CloudFront, read the deploy config.

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.65"
    }
  }
}

variable "name" {
  type = string
}

variable "github_repository" {
  description = "owner/repo"
  type        = string
}

variable "allowed_branches" {
  type    = list(string)
  default = ["development"]
}

variable "lambda_function_arns" {
  type = list(string)
}

variable "bucket_arns" {
  type = list(string)
}

variable "distribution_arns" {
  type = list(string)
}

variable "deploy_config_parameter_arn" {
  type = string
}

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_policy_document" "trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [for b in var.allowed_branches : "repo:${var.github_repository}:ref:refs/heads/${b}"]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name                 = var.name
  assume_role_policy   = data.aws_iam_policy_document.trust.json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "deploy" {
  statement {
    sid       = "UpdateFunctionCode"
    actions   = ["lambda:UpdateFunctionCode", "lambda:GetFunction", "lambda:GetFunctionConfiguration"]
    resources = var.lambda_function_arns
  }
  statement {
    sid       = "ListSiteBuckets"
    actions   = ["s3:ListBucket"]
    resources = var.bucket_arns
  }
  statement {
    sid       = "WriteSiteObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = [for b in var.bucket_arns : "${b}/*"]
  }
  statement {
    sid       = "InvalidateCdn"
    actions   = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"]
    resources = var.distribution_arns
  }
  statement {
    sid       = "ReadDeployConfig"
    actions   = ["ssm:GetParameter"]
    resources = [var.deploy_config_parameter_arn]
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "deploy"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}

output "role_arn" {
  value = aws_iam_role.deploy.arn
}
