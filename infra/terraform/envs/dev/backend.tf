terraform {
  backend "s3" {
    bucket       = "giftnjoys-tfstate-637423417590-ap-south-1"
    key          = "dev/terraform.tfstate"
    region       = "ap-south-1"
    profile      = "giftnjoys-dev"
    encrypt      = true
    use_lockfile = true
  }
}
