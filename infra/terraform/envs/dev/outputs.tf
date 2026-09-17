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
