output "region" {
  value = var.region
}

output "account_id" {
  value = data.aws_caller_identity.current.account_id
}

output "table_prefix" {
  value = local.table_prefix
}

output "admin_email" {
  value = var.admin_email
}

output "admin_initial_password_parameter" {
  description = "aws ssm get-parameter --with-decryption --name <this> --profile giftnjoys-dev"
  value       = aws_ssm_parameter.admin_initial_password.name
}

output "media_bucket_name" {
  value = module.media_cdn.media_bucket_name
}

output "imports_bucket_name" {
  value = module.media_cdn.imports_bucket_name
}

output "cdn_url" {
  value = module.media_cdn.cdn_url
}

output "distribution_id" {
  value = module.media_cdn.distribution_id
}

output "public_api_url" {
  value = module.public_api.api_endpoint
}

output "admin_api_url" {
  value = module.admin_api.api_endpoint
}

output "dead_letter_queues" {
  value = [module.notifications_queue.dlq_name, module.imports_queue.dlq_name]
}

output "web_url" {
  value = module.web.url
}

output "admin_url" {
  value = module.admin_site.url
}

output "deploy_config_parameter" {
  value = aws_ssm_parameter.deploy_config.name
}

output "github_deploy_role_arn" {
  value = module.github_deploy.role_arn
}
