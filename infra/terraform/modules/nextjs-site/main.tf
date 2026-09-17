# Next.js (OpenNext build) on Lambda + CloudFront.
#   /_next/*, /BUILD_ID      -> S3 (_assets prefix, CloudFront OAC)
#   everything else          -> server Lambda function URL (IAM auth, CloudFront OAC)
# ISR cache lives in S3 (_cache prefix); revalidation goes through a FIFO SQS queue.

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.65"
    }
  }
}

variable "name" {
  description = "e.g. giftnjoys-dev-web"
  type        = string
}

variable "server_environment" {
  description = "Extra environment variables for the Next.js server function"
  type        = map(string)
  default     = {}
}

variable "server_memory_size" {
  type    = number
  default = 1024
}

variable "price_class" {
  type    = string
  default = "PriceClass_200"
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  bucket_name = "${var.name}-${data.aws_caller_identity.current.account_id}"
}

# ---------------------------------------------------------------- bucket (assets + ISR cache)

resource "aws_s3_bucket" "site" {
  bucket = local.bucket_name
}

resource "aws_s3_bucket_ownership_controls" "site" {
  bucket = aws_s3_bucket.site.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  bucket = aws_s3_bucket.site.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "site" {
  bucket = aws_s3_bucket.site.id
  rule {
    id     = "expire-old-isr-cache"
    status = "Enabled"
    filter {
      prefix = "_cache/"
    }
    expiration {
      days = 30
    }
  }
}

# ---------------------------------------------------------------- revalidation queue + function

resource "aws_sqs_queue" "revalidation" {
  name                        = "${var.name}-revalidation.fifo"
  fifo_queue                  = true
  content_based_deduplication = true
  visibility_timeout_seconds  = 180
  sqs_managed_sse_enabled     = true
}

data "aws_iam_policy_document" "server" {
  statement {
    sid       = "IsrCacheObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.site.arn}/_cache/*"]
  }
  statement {
    sid       = "IsrCacheList"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.site.arn]
  }
  statement {
    sid       = "Revalidation"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.revalidation.arn]
  }
}

module "server" {
  source      = "../lambda-function"
  name        = "${var.name}-server"
  memory_size = var.server_memory_size
  timeout     = 15
  policy_json = data.aws_iam_policy_document.server.json
  environment = merge({
    CACHE_BUCKET_NAME         = aws_s3_bucket.site.bucket
    CACHE_BUCKET_KEY_PREFIX   = "_cache"
    CACHE_BUCKET_REGION       = data.aws_region.current.region
    REVALIDATION_QUEUE_URL    = aws_sqs_queue.revalidation.url
    REVALIDATION_QUEUE_REGION = data.aws_region.current.region
  }, var.server_environment)
}

data "aws_iam_policy_document" "revalidation" {
  statement {
    actions   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
    resources = [aws_sqs_queue.revalidation.arn]
  }
}

module "revalidation" {
  source      = "../lambda-function"
  name        = "${var.name}-revalidation"
  memory_size = 256
  timeout     = 30
  policy_json = data.aws_iam_policy_document.revalidation.json
}

resource "aws_lambda_event_source_mapping" "revalidation" {
  event_source_arn = aws_sqs_queue.revalidation.arn
  function_name    = module.revalidation.function_arn
  batch_size       = 5
}

resource "aws_lambda_function_url" "server" {
  function_name      = module.server.function_name
  authorization_type = "AWS_IAM"
  invoke_mode        = "BUFFERED"
}

# ---------------------------------------------------------------- CloudFront

resource "aws_cloudfront_origin_access_control" "s3" {
  name                              = "${var.name}-s3"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_origin_access_control" "lambda" {
  name                              = "${var.name}-lambda"
  origin_access_control_origin_type = "lambda"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# OpenNext rebuilds absolute URLs from x-forwarded-host (the origin sees the Lambda URL host).
resource "aws_cloudfront_function" "forwarded_host" {
  name    = "${var.name}-forwarded-host"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = <<-JS
    function handler(event) {
      var request = event.request;
      request.headers['x-forwarded-host'] = { value: request.headers.host.value };
      return request;
    }
  JS
}

resource "aws_cloudfront_cache_policy" "server" {
  name        = "${var.name}-server"
  comment     = "Next.js pages: cache only when the origin sends s-maxage (ISR)"
  default_ttl = 0
  min_ttl     = 0
  max_ttl     = 31536000

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_gzip   = true
    enable_accept_encoding_brotli = true
    cookies_config {
      cookie_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "all"
    }
    headers_config {
      header_behavior = "whitelist"
      headers {
        items = [
          "accept",
          "rsc",
          "next-router-prefetch",
          "next-router-state-tree",
          "next-router-segment-prefetch",
          "next-url",
          "x-prerender-revalidate",
        ]
      }
    }
  }
}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

data "aws_cloudfront_response_headers_policy" "security" {
  name = "Managed-SecurityHeadersPolicy"
}

resource "aws_cloudfront_distribution" "site" {
  enabled         = true
  is_ipv6_enabled = true
  http_version    = "http2and3"
  comment         = "${var.name} storefront"
  price_class     = var.price_class

  origin {
    origin_id                = "s3-assets"
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_path              = "/_assets"
    origin_access_control_id = aws_cloudfront_origin_access_control.s3.id
  }

  origin {
    origin_id                = "server"
    domain_name              = split("/", aws_lambda_function_url.server.function_url)[2]
    origin_access_control_id = aws_cloudfront_origin_access_control.lambda.id
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  ordered_cache_behavior {
    path_pattern               = "_next/data/*"
    target_origin_id           = "server"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = aws_cloudfront_cache_policy.server.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security.id
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.forwarded_host.arn
    }
  }

  ordered_cache_behavior {
    path_pattern               = "_next/*"
    target_origin_id           = "s3-assets"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_optimized.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security.id
  }

  ordered_cache_behavior {
    path_pattern               = "BUILD_ID"
    target_origin_id           = "s3-assets"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_optimized.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security.id
  }

  default_cache_behavior {
    target_origin_id           = "server"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = aws_cloudfront_cache_policy.server.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security.id
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.forwarded_host.arn
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

# Only CloudFront may read public assets; the ISR cache prefix stays private to the server function.
data "aws_iam_policy_document" "bucket" {
  statement {
    sid       = "AllowCloudFrontReadAssets"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.site.arn}/_assets/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.site.arn]
    }
  }
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.site.arn, "${aws_s3_bucket.site.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "site" {
  bucket     = aws_s3_bucket.site.id
  policy     = data.aws_iam_policy_document.bucket.json
  depends_on = [aws_s3_bucket_public_access_block.site]
}

resource "aws_lambda_permission" "cloudfront_function_url" {
  statement_id           = "AllowCloudFrontInvokeFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = module.server.function_name
  principal              = "cloudfront.amazonaws.com"
  source_arn             = aws_cloudfront_distribution.site.arn
  function_url_auth_type = "AWS_IAM"
}

resource "aws_lambda_permission" "cloudfront_invoke" {
  statement_id  = "AllowCloudFrontInvokeFunction"
  action        = "lambda:InvokeFunction"
  function_name = module.server.function_name
  principal     = "cloudfront.amazonaws.com"
  source_arn    = aws_cloudfront_distribution.site.arn
}

output "url" {
  value = "https://${aws_cloudfront_distribution.site.domain_name}"
}

output "distribution_id" {
  value = aws_cloudfront_distribution.site.id
}

output "distribution_arn" {
  value = aws_cloudfront_distribution.site.arn
}

output "bucket_name" {
  value = aws_s3_bucket.site.bucket
}

output "bucket_arn" {
  value = aws_s3_bucket.site.arn
}

output "server_function_name" {
  value = module.server.function_name
}

output "server_function_arn" {
  value = module.server.function_arn
}

output "revalidation_function_name" {
  value = module.revalidation.function_name
}

output "revalidation_function_arn" {
  value = module.revalidation.function_arn
}
