# Backend: DynamoDB, SQS, SES, SSM secrets, four Lambdas and two HTTP APIs.
# Lambda code is deployed separately by scripts/deploy/deploy.sh (Terraform creates placeholders).

locals {
  public_site_url = module.web.url
  admin_site_url  = module.admin_site.url

  # Created out-of-band (Meta doesn't have a Terraform provider) — see the WhatsApp Business
  # Platform app dashboard. Not namespaced per-environment since there's one Meta app for now.
  whatsapp_token_param      = "/giftnjoys/whatsapp/token"
  whatsapp_app_secret_param = "/giftnjoys/whatsapp/app-secret"

  common_env = {
    APP_ENV                 = var.environment
    LOG_LEVEL               = "info"
    MEDIA_BASE_URL          = module.media_cdn.cdn_url
    PUBLIC_SITE_URL         = local.public_site_url
    ADMIN_SITE_URL          = local.admin_site_url
    QUEUE_MODE              = "sqs"
    NOTIFICATIONS_QUEUE_URL = module.notifications_queue.url
    EMAIL_TRANSPORT         = "ses"
    EMAIL_FROM              = "GiftNJoys <${var.admin_email}>"
  }

  admin_env = merge(local.common_env, {
    MEDIA_BUCKET                    = module.media_cdn.media_bucket_name
    IMPORTS_BUCKET                  = module.media_cdn.imports_bucket_name
    IMPORTS_QUEUE_URL               = module.imports_queue.url
    AUTH_MODE                       = "local"
    LOCAL_JWT_SECRET_SSM_PARAM      = aws_ssm_parameter.jwt_secret.name
    CORS_ORIGINS                    = join(",", concat([local.admin_site_url], var.local_admin_origins))
    WHATSAPP_ACCESS_TOKEN_SSM_PARAM = local.whatsapp_token_param
    WHATSAPP_APP_SECRET_SSM_PARAM   = local.whatsapp_app_secret_param
    WHATSAPP_VERIFY_TOKEN_SSM_PARAM = aws_ssm_parameter.whatsapp_verify_token.name
  })

  public_env = merge(local.common_env, {
    CORS_ORIGINS        = join(",", concat([local.public_site_url], var.local_public_origins))
    CATALOG_TTL_SECONDS = "300"
  })
}

data "aws_caller_identity" "current" {}

# ---------------------------------------------------------------- data + messaging

module "tables" {
  source       = "../../modules/dynamodb-tables"
  table_prefix = local.table_prefix
}

module "notifications_queue" {
  source                     = "../../modules/sqs-queue"
  name                       = "${local.name}-notifications"
  visibility_timeout_seconds = 360
  max_receive_count          = 5
}

module "imports_queue" {
  source                     = "../../modules/sqs-queue"
  name                       = "${local.name}-imports"
  visibility_timeout_seconds = 1800
  max_receive_count          = 2
}

# SES sends a verification link to this address; emails only go out after it is clicked.
# While the account is in the SES sandbox, recipients must be verified too.
resource "aws_sesv2_email_identity" "sender" {
  email_identity = var.admin_email
}

# ---------------------------------------------------------------- secrets (SSM SecureString)

resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

resource "aws_ssm_parameter" "jwt_secret" {
  name  = "/giftnjoys/${var.environment}/admin/jwt-secret"
  type  = "SecureString"
  value = random_password.jwt_secret.result
}

resource "random_password" "whatsapp_verify_token" {
  length  = 32
  special = false
}

# Shared secret Meta echoes back during the webhook "verify and save" handshake — not a credential
# on its own, but kept in SSM alongside the others for consistency.
resource "aws_ssm_parameter" "whatsapp_verify_token" {
  name  = "/giftnjoys/${var.environment}/whatsapp/verify-token"
  type  = "SecureString"
  value = random_password.whatsapp_verify_token.result
}

resource "random_password" "admin_initial" {
  length  = 20
  special = false
}

resource "aws_ssm_parameter" "admin_initial_password" {
  name        = "/giftnjoys/${var.environment}/admin/initial-password"
  description = "Initial password for the seeded admin user (${var.admin_email})"
  type        = "SecureString"
  value       = random_password.admin_initial.result
}

# ---------------------------------------------------------------- IAM policies

data "aws_iam_policy_document" "public_api" {
  statement {
    sid = "Tables"
    actions = [
      "dynamodb:GetItem", "dynamodb:BatchGetItem", "dynamodb:Query", "dynamodb:Scan",
      "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:ConditionCheckItem",
    ]
    resources = module.tables.table_and_index_arns
  }
  statement {
    sid       = "EnqueueNotifications"
    actions   = ["sqs:SendMessage"]
    resources = [module.notifications_queue.arn]
  }
}

data "aws_iam_policy_document" "admin_api" {
  statement {
    sid = "Tables"
    actions = [
      "dynamodb:GetItem", "dynamodb:BatchGetItem", "dynamodb:Query", "dynamodb:Scan",
      "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:ConditionCheckItem",
    ]
    resources = module.tables.table_and_index_arns
  }
  statement {
    sid       = "Objects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["arn:aws:s3:::${module.media_cdn.media_bucket_name}/*", "arn:aws:s3:::${module.media_cdn.imports_bucket_name}/*"]
  }
  statement {
    sid       = "ListForHeadObject"
    actions   = ["s3:ListBucket"]
    resources = ["arn:aws:s3:::${module.media_cdn.media_bucket_name}", "arn:aws:s3:::${module.media_cdn.imports_bucket_name}"]
  }
  statement {
    sid       = "Queues"
    actions   = ["sqs:SendMessage", "sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
    resources = [module.notifications_queue.arn, module.imports_queue.arn]
  }
  statement {
    sid     = "Secrets"
    actions = ["ssm:GetParameter"]
    resources = [
      aws_ssm_parameter.jwt_secret.arn,
      aws_ssm_parameter.whatsapp_verify_token.arn,
      "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter${local.whatsapp_token_param}",
      "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter${local.whatsapp_app_secret_param}",
    ]
  }
  statement {
    sid       = "SendEmail"
    actions   = ["ses:SendEmail"]
    resources = ["arn:aws:ses:${var.region}:${data.aws_caller_identity.current.account_id}:identity/*"]
  }
}

# ---------------------------------------------------------------- functions

module "public_api_fn" {
  source      = "../../modules/lambda-function"
  name        = "${local.name}-public-api"
  memory_size = 1024
  timeout     = 15
  environment = local.public_env
  policy_json = data.aws_iam_policy_document.public_api.json
}

# One bundle, three handlers: HTTP API, import worker, notifier.
module "admin_api_fn" {
  source      = "../../modules/lambda-function"
  name        = "${local.name}-admin-api"
  memory_size = 1024
  timeout     = 29
  environment = local.admin_env
  policy_json = data.aws_iam_policy_document.admin_api.json
}

module "import_worker_fn" {
  source      = "../../modules/lambda-function"
  name        = "${local.name}-import-worker"
  handler     = "index.importWorker"
  memory_size = 2048
  timeout     = 300
  environment = local.admin_env
  policy_json = data.aws_iam_policy_document.admin_api.json
}

module "notifier_fn" {
  source      = "../../modules/lambda-function"
  name        = "${local.name}-notifier"
  handler     = "index.notifier"
  memory_size = 512
  timeout     = 60
  environment = local.admin_env
  policy_json = data.aws_iam_policy_document.admin_api.json
}

resource "aws_lambda_event_source_mapping" "imports" {
  event_source_arn        = module.imports_queue.arn
  function_name           = module.import_worker_fn.function_arn
  batch_size              = 1
  function_response_types = ["ReportBatchItemFailures"]
}

resource "aws_lambda_event_source_mapping" "notifications" {
  event_source_arn        = module.notifications_queue.arn
  function_name           = module.notifier_fn.function_arn
  batch_size              = 5
  function_response_types = ["ReportBatchItemFailures"]
  scaling_config {
    maximum_concurrency = 2
  }
}

# ---------------------------------------------------------------- HTTP APIs (default execute-api domains)

module "public_api" {
  source                 = "../../modules/http-api"
  name                   = "${local.name}-public-api"
  function_name          = module.public_api_fn.function_name
  invoke_arn             = module.public_api_fn.invoke_arn
  throttling_burst_limit = 100
  throttling_rate_limit  = 50
}

module "admin_api" {
  source                 = "../../modules/http-api"
  name                   = "${local.name}-admin-api"
  function_name          = module.admin_api_fn.function_name
  invoke_arn             = module.admin_api_fn.invoke_arn
  throttling_burst_limit = 40
  throttling_rate_limit  = 20
}
