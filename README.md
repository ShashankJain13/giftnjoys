# 🎁 GiftNJoys

Gifting e-commerce platform: public storefront + admin panel. Products can be imported from **WhatsApp group chat exports**.
Orders are placed without payment, arrive **PENDING**, and are approved and shipped by an admin. Customers are kept updated by email and WhatsApp (click-to-chat).

| Service | Tech | Local URL |
|---|---|---|
| Storefront (`apps/web`) | Next.js 16, Tailwind 4 | http://localhost:3000 |
| Admin panel (`apps/admin-web`) | React 19 + Vite, TanStack Query | http://localhost:5173 |
| Public API (`services/public-api`) | Hono on Node / AWS Lambda | http://localhost:4000 |
| Admin API (`services/admin-api`) | Hono on Node / AWS Lambda (+ import & email workers) | http://localhost:4001 |

Local infrastructure (Docker): DynamoDB Local `:8000` (UI `:8001`), MinIO S3 `:9000` (console `:9001`), Mailpit `:8025` (catches every email).

## Quick start

Prerequisites: Node.js ≥ 22, Docker Desktop, pnpm via corepack.

```bash
corepack enable pnpm              # once per machine
pnpm install
cp .env.example .env.local        # then set LOCAL_JWT_SECRET (openssl rand -hex 32) and ADMIN_PASSWORD
pnpm local:up                     # DynamoDB Local, MinIO, Mailpit
pnpm db:setup                     # tables + buckets (idempotent)
pnpm seed                         # 8 categories, 21 sample products, settings, admin user
pnpm dev                          # all 4 services with hot reload
```

Sign in to the admin panel with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env.local`. If you change the password, run `pnpm seed` again.

## How the business flow works

1. **Import**: Admin → *WhatsApp import* → upload the chat export. Each product post becomes a **draft** with parsed name, price, MRP, images and a guessed category. Review, fix and publish.
2. **Shop**: the customer browses, adds to cart and checks out (name, WhatsApp number, address, gift wrap and message). Prices are always recalculated on the server.
3. **Order placed** (status `PENDING`):
   - The admin gets an email.
   - The customer gets an email and a **"Send order on WhatsApp"** button that opens WhatsApp with the order prefilled.
4. **Approve**: stock is deducted atomically (overselling is impossible) and the customer is emailed.
5. **Ship**: the admin enters courier, AWB and tracking link. The customer is emailed, and the admin can send a prefilled WhatsApp update.
6. **Deliver / Reject / Cancel**: each sends its own email. Cancelling an approved order puts the stock back.
7. **Track**: customers look up an order at `/track` with the order number and mobile number.

### Exporting a WhatsApp group chat

- **Android**: group → ⋮ → More → Export chat → *Include media*
- **iPhone**: group name → Export Chat → *Attach Media*

Upload the resulting `.zip` (a `.txt` also works, but without images). Posts that were already imported are skipped automatically. Keep real exports in `samples/`, which is git-ignored.

## Testing

```bash
pnpm typecheck    # all packages
pnpm test         # unit tests + DynamoDB Local integration tests (stack must be up)
pnpm smoke        # API smoke checks against running services (47 checks)
pnpm e2e          # Playwright full journey: import → publish → order → approve → ship → track
                  # first time: pnpm --filter @gnj/e2e run install-browsers
```

Screenshots from the e2e run are saved in `e2e/test-results/screens/`.

## Repository layout

```
apps/web                 storefront (Next.js)
apps/admin-web           admin panel (React + Vite)
services/public-api      catalog, search, cart quote, orders, tracking
services/admin-api       products, categories, imports, orders, settings, dashboard + Lambda workers
packages/core            zod schemas, DynamoDB repositories, order state machine, pricing, WhatsApp links
packages/adapters        S3/MinIO storage, SMTP/SES email, in-process/SQS queue, logger
packages/wa-import       WhatsApp export parser (Android + iOS formats, safe unzip, dedupe)
packages/notifications   order email templates + notification handler
scripts                  local setup, seed, smoke tests
infra/local              docker-compose for local infrastructure
e2e                      Playwright tests
```

Every piece of infrastructure is behind an adapter, so the same code runs locally and on AWS:

| Concern | Local | AWS |
|---|---|---|
| Database | DynamoDB Local | DynamoDB (on-demand) |
| Files | MinIO | S3 + CloudFront |
| Email | Mailpit (SMTP) | SES |
| Queues | in-process | SQS → Lambda workers |
| Admin auth | local JWT (bcrypt user in DynamoDB) | Cognito |

## AWS deployment (dev)

Low-cost serverless setup in `ap-south-1`, fully managed with Terraform (profile `giftnjoys-dev`). Idle cost is about $0, and roughly $0–2/month at launch traffic.

| Piece | AWS services | URL |
|---|---|---|
| Storefront | Next.js via OpenNext → Lambda + CloudFront; S3 for static files and the page cache; SQS FIFO queue for page refreshes | `terraform output web_url` |
| Admin panel | S3 + CloudFront (single-page app, `noindex`) | `terraform output admin_url` |
| Public / Admin API | API Gateway HTTP API → Lambda (Hono) | `public_api_url`, `admin_api_url` |
| Workers | SQS → Lambda (WhatsApp import, email notifier), each queue with a dead-letter queue | — |
| Data & files | DynamoDB `gnj-dev-*` (on-demand, PITR), S3 media bucket + CloudFront | `cdn_url` |
| Email | SES (sender identity = admin email) | — |
| Secrets | SSM Parameter Store (admin login signing secret, initial admin password) | — |

### Infrastructure (manual, reviewed)

```bash
export AWS_PROFILE=giftnjoys-dev
aws sts get-caller-identity                          # confirm account 637423417590
cd infra/terraform/envs/dev
cp terraform.tfvars.example terraform.tfvars         # set admin_email (git-ignored)
terraform init
terraform plan -out=dev.tfplan                       # review!
terraform apply dev.tfplan
```

Terraform creates Lambdas with placeholder code and never touches their code afterwards. Application code is deployed separately (see below).

### Application deploys

```bash
AWS_PROFILE=giftnjoys-dev scripts/deploy/deploy.sh dev
```

The script builds and uploads the APIs and workers, the OpenNext storefront and the admin panel, invalidates CloudFront and runs health checks. It reads all resource names from the SSM parameter `/giftnjoys/dev/deploy-config`.

GitHub Actions does the same on every push to `development` (`.github/workflows/deploy-dev.yml`). It signs in through an IAM role that trusts GitHub, so no AWS keys are stored in GitHub. `ci.yml` runs typecheck, tests with DynamoDB Local, and Terraform format/validate. CI never runs `terraform apply`.

### First-time setup

```bash
AWS_PROFILE=giftnjoys-dev pnpm seed -- --aws                  # categories, settings, admin user (+ sample products; add --no-samples to skip)
aws ssm get-parameter --with-decryption --profile giftnjoys-dev --region ap-south-1 \
  --name /giftnjoys/dev/admin/initial-password --query Parameter.Value --output text   # admin login password
```

- **SES:** click the verification link AWS emails to the admin address, or no emails go out. SES starts in sandbox mode, so only verified addresses receive mail. Request production access before real customers order.
- **Publish delay:** newly published products appear on the storefront within ~5 minutes (public API catalog cache).
- **Smoke tests against AWS:** set `SMOKE_PUBLIC_API`, `SMOKE_ADMIN_API`, `SMOKE_ADMIN_EMAIL`, `SMOKE_ADMIN_PASSWORD` and `SMOKE_MAILPIT=off`, then run `pnpm smoke`. The tests create data, so clean up afterwards.

## Notes

- Never commit `.env.local`, credential CSVs, `*.tfvars` or Terraform state; `.gitignore` already covers them.
- The MinIO image comes from `quay.io/minio/minio` because Docker Hub's `minio/minio` is no longer published.
- Policy pages (`/shipping-policy`, `/returns-policy`, `/privacy-policy`, `/terms`) contain template text. Review it before going live.
- Before production: SES production access, custom domain (Route 53 + ACM), Cognito for admin login, a `prod` Terraform env with deletion protection.
