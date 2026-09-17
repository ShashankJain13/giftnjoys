output "media_bucket_name" {
  value = aws_s3_bucket.media.bucket
}

output "media_bucket_arn" {
  value = aws_s3_bucket.media.arn
}

output "imports_bucket_name" {
  value = var.create_imports_bucket ? aws_s3_bucket.imports[0].bucket : null
}

output "imports_bucket_arn" {
  value = var.create_imports_bucket ? aws_s3_bucket.imports[0].arn : null
}

output "cdn_domain_name" {
  value = aws_cloudfront_distribution.media.domain_name
}

output "cdn_url" {
  description = "Use as MEDIA_BASE_URL"
  value       = "https://${aws_cloudfront_distribution.media.domain_name}"
}

output "distribution_id" {
  value = aws_cloudfront_distribution.media.id
}

output "distribution_arn" {
  value = aws_cloudfront_distribution.media.arn
}
