# Storefront (Next.js via OpenNext on Lambda + CloudFront), admin SPA (S3 + CloudFront),
# deploy wiring for GitHub Actions, and a cost alert.

module "web" {
  source = "../../modules/nextjs-site"
  name   = "${local.name}-web"
  server_environment = {
    API_URL = module.public_api.api_endpoint
  }
}

module "admin_site" {
  source = "../../modules/static-site"
  name   = "${local.name}-admin"
}

# Everything the deploy script needs, in one place (read by scripts/deploy/deploy.sh).
resource "aws_ssm_parameter" "deploy_config" {
  name = "/giftnjoys/${var.environment}/deploy-config"
  type = "String"
  value = jsonencode({
    region      = var.region
    environment = var.environment
    functions = {
      publicApi       = module.public_api_fn.function_name
      adminApi        = module.admin_api_fn.function_name
      importWorker    = module.import_worker_fn.function_name
      notifier        = module.notifier_fn.function_name
      webServer       = module.web.server_function_name
      webRevalidation = module.web.revalidation_function_name
    }
    buckets = {
      web   = module.web.bucket_name
      admin = module.admin_site.bucket_name
    }
    distributions = {
      web   = module.web.distribution_id
      admin = module.admin_site.distribution_id
    }
    urls = {
      web       = module.web.url
      admin     = module.admin_site.url
      publicApi = module.public_api.api_endpoint
      adminApi  = module.admin_api.api_endpoint
      media     = module.media_cdn.cdn_url
    }
  })
}

module "github_deploy" {
  source            = "../../modules/github-deploy-role"
  name              = "${local.name}-github-deploy"
  github_repository = var.github_repository
  allowed_branches  = ["development"]
  lambda_function_arns = [
    module.public_api_fn.function_arn,
    module.admin_api_fn.function_arn,
    module.import_worker_fn.function_arn,
    module.notifier_fn.function_arn,
    module.web.server_function_arn,
    module.web.revalidation_function_arn,
  ]
  bucket_arns                 = [module.web.bucket_arn, module.admin_site.bucket_arn]
  distribution_arns           = [module.web.distribution_arn, module.admin_site.distribution_arn]
  deploy_config_parameter_arn = aws_ssm_parameter.deploy_config.arn
}

resource "aws_budgets_budget" "monthly" {
  name         = "${local.name}-monthly"
  budget_type  = "COST"
  limit_amount = var.monthly_budget_usd
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.admin_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.admin_email]
  }
}
