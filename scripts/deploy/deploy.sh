#!/usr/bin/env bash
# Builds and deploys GiftNJoys application code to an environment created by Terraform.
#
#   Local:  AWS_PROFILE=giftnjoys-dev scripts/deploy/deploy.sh dev
#   CI:     .github/workflows/deploy-dev.yml (credentials from the GitHub OIDC role)
#
# Order matters: APIs first (the storefront build prerenders pages by calling the public API),
# then storefront, then admin panel, then CloudFront invalidations.
set -euo pipefail

ENV="${1:-dev}"
REGION="${AWS_REGION:-ap-south-1}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cd "$ROOT"

for bin in aws pnpm node zip curl; do
  command -v "$bin" >/dev/null || { echo "Missing required command: $bin" >&2; exit 1; }
done

echo "==> Deploying '$ENV' as $(aws sts get-caller-identity --query Arn --output text)"
CONFIG="$(aws ssm get-parameter --region "$REGION" --name "/giftnjoys/$ENV/deploy-config" --query Parameter.Value --output text)"
cfg() { node -e 'const c = JSON.parse(process.argv[1]); console.log(process.argv[2].split(".").reduce((o, k) => o[k], c));' "$CONFIG" "$1"; }

WEB_URL="$(cfg urls.web)"
ADMIN_URL="$(cfg urls.admin)"
PUBLIC_API_URL="$(cfg urls.publicApi)"
ADMIN_API_URL="$(cfg urls.adminApi)"
MEDIA_URL="$(cfg urls.media)"

deploy_lambda() {
  local fn="$1" zip="$2"
  aws lambda update-function-code --region "$REGION" --function-name "$fn" --zip-file "fileb://$zip" --output text --query LastUpdateStatus >/dev/null
  aws lambda wait function-updated-v2 --region "$REGION" --function-name "$fn"
  echo "    ✓ $fn"
}

zip_dir() {
  local dir="$1" out="$2"
  (cd "$dir" && zip -qr "$out" .)
}

wait_healthy() {
  local url="$1"
  for _ in $(seq 1 20); do
    if curl -fsS -o /dev/null "$url"; then echo "    ✓ $url"; return 0; fi
    sleep 3
  done
  echo "    ✗ $url did not become healthy" >&2
  return 1
}

# ------------------------------------------------------------------ APIs + workers
echo "==> Building API bundles"
pnpm --filter @gnj/public-api --filter @gnj/admin-api run build >/dev/null
zip_dir services/public-api/dist/public-api "$TMP/public-api.zip"
zip_dir services/admin-api/dist/admin-api "$TMP/admin-api.zip"

echo "==> Updating API and worker functions"
deploy_lambda "$(cfg functions.publicApi)" "$TMP/public-api.zip"
deploy_lambda "$(cfg functions.adminApi)" "$TMP/admin-api.zip"
deploy_lambda "$(cfg functions.importWorker)" "$TMP/admin-api.zip"
deploy_lambda "$(cfg functions.notifier)" "$TMP/admin-api.zip"
wait_healthy "$PUBLIC_API_URL/health"
wait_healthy "$ADMIN_API_URL/health"

# ------------------------------------------------------------------ storefront (OpenNext)
echo "==> Building storefront (OpenNext)"
(
  cd apps/web
  rm -rf .open-next
  NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_API_URL="$PUBLIC_API_URL" API_URL="$PUBLIC_API_URL" \
    NEXT_PUBLIC_SITE_URL="$WEB_URL" PUBLIC_SITE_URL="$WEB_URL" \
    pnpm run build:aws >"$TMP/web-build.log" 2>&1 || { tail -40 "$TMP/web-build.log"; exit 1; }
)
WEB_BUCKET="$(cfg buckets.web)"
OPEN_NEXT=apps/web/.open-next

echo "==> Uploading storefront assets and ISR cache"
aws s3 sync "$OPEN_NEXT/assets" "s3://$WEB_BUCKET/_assets" --region "$REGION" --only-show-errors \
  --exclude "*" --include "_next/*" --cache-control "public,max-age=31536000,immutable"
aws s3 sync "$OPEN_NEXT/assets" "s3://$WEB_BUCKET/_assets" --region "$REGION" --only-show-errors \
  --exclude "_next/*" --cache-control "public,max-age=0,s-maxage=31536000,must-revalidate"
aws s3 sync "$OPEN_NEXT/cache" "s3://$WEB_BUCKET/_cache" --region "$REGION" --only-show-errors

echo "==> Updating storefront functions"
zip_dir "$OPEN_NEXT/server-functions/default" "$TMP/web-server.zip"
zip_dir "$OPEN_NEXT/revalidation-function" "$TMP/web-revalidation.zip"
deploy_lambda "$(cfg functions.webServer)" "$TMP/web-server.zip"
deploy_lambda "$(cfg functions.webRevalidation)" "$TMP/web-revalidation.zip"

# ------------------------------------------------------------------ admin panel
echo "==> Building admin panel"
VITE_ADMIN_API_URL="$ADMIN_API_URL" VITE_PUBLIC_SITE_URL="$WEB_URL" VITE_MEDIA_BASE_URL="$MEDIA_URL" \
  pnpm --filter @gnj/admin-web run build >"$TMP/admin-build.log" 2>&1 || { tail -40 "$TMP/admin-build.log"; exit 1; }
ADMIN_BUCKET="$(cfg buckets.admin)"

echo "==> Uploading admin panel"
aws s3 sync apps/admin-web/dist "s3://$ADMIN_BUCKET" --region "$REGION" --only-show-errors \
  --exclude "index.html" --cache-control "public,max-age=31536000,immutable"
aws s3 cp apps/admin-web/dist/index.html "s3://$ADMIN_BUCKET/index.html" --region "$REGION" --only-show-errors \
  --cache-control "no-cache"

# ------------------------------------------------------------------ CDN
echo "==> Invalidating CloudFront caches"
aws cloudfront create-invalidation --distribution-id "$(cfg distributions.web)" --paths "/*" --query Invalidation.Id --output text >/dev/null
aws cloudfront create-invalidation --distribution-id "$(cfg distributions.admin)" --paths "/" "/index.html" --query Invalidation.Id --output text >/dev/null

echo "==> Smoke checks"
wait_healthy "$WEB_URL/"
wait_healthy "$ADMIN_URL/"

cat <<SUMMARY

Deployed '$ENV':
  Storefront   $WEB_URL
  Admin panel  $ADMIN_URL
  Public API   $PUBLIC_API_URL
  Admin API    $ADMIN_API_URL
SUMMARY
