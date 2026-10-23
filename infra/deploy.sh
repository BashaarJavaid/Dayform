#!/usr/bin/env bash
# T-40 deploy. APPROVAL NEEDED for every run (creates/updates AWS resources). Reuses the Aurora cluster `dayform-db`
# (AURORA_* in .env.local); it does not create a database.
#   npm run deploy -w @dayform/infra            server + jobs stacks, writes .env.aws
#   npm run destroy -w @dayform/infra           deletes both stacks (never run automatically; the cluster stays)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT/infra"
set -a; . "$ROOT/.env.local"; set +a
REGION=${AWS_REGION:-us-east-1}; SERVER=dayform-server; JOBS=dayform-jobs; FN=dayform-overnight
cfn() { aws cloudformation "$@" --region "$REGION"; }
out() { cfn describe-stacks --stack-name "$1" --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue" --output text; }

if [ "${1:-}" = destroy ]; then
  for s in "$JOBS" "$SERVER"; do cfn delete-stack --stack-name "$s"; cfn wait stack-delete-complete --stack-name "$s"; echo "deleted $s"; done
  rm -f "$ROOT/.env.aws"; exit 0
fi
: "${AURORA_CLUSTER_ARN:?}" "${AURORA_SECRET_ARN:?}" "${AURORA_DATABASE:?}" "${REASONING_MODEL_ID:?}" "${REASONING_MODEL_FALLBACK_ID:?}" "${ADMIN_TOKEN:?}"
COMMON=(ClusterArn="$AURORA_CLUSTER_ARN" SecretArn="$AURORA_SECRET_ARN" Database="$AURORA_DATABASE"
  ReasoningModelId="$REASONING_MODEL_ID" ReasoningModelFallbackId="$REASONING_MODEL_FALLBACK_ID" DemoTz="${DEMO_TZ:-Asia/Karachi}")
TAG=${TAG:-$(date -u +%Y%m%d-%H%M%S)}
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGISTRY="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"
server() { cfn deploy --stack-name "$SERVER" --template-file server.yaml --capabilities CAPABILITY_IAM --parameter-overrides \
  "${COMMON[@]}" AdminToken="$ADMIN_TOKEN" CheckoutConfirm="${CHECKOUT_CONFIRM:-elicitation}" CreateRuntime="$1" ImageTag="$TAG"; }

# Pass 1 only on the first deploy; on an existing stack CreateRuntime=false would delete the runtime.
if cfn describe-stacks --stack-name "$SERVER" >/dev/null 2>&1; then echo "== 1/5 $SERVER exists"
else echo "== 1/5 $SERVER: ECR repo + execution role"; server false; fi

echo "== 2/5 build and push linux/arm64 server image $REGISTRY/dayform-server:$TAG"
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"
docker buildx build --platform linux/arm64 --provenance=false -f "$ROOT/server/Dockerfile" -t "$REGISTRY/dayform-server:$TAG" --push "$ROOT"

echo "== 3/5 $SERVER: AgentCore runtime on image $TAG"; server true
ARN=$(out "$SERVER" RuntimeArn)

echo "== 4/5 $JOBS: overnight Lambda + 03:00 Asia/Karachi schedule (DISABLED)"
B="$ROOT/infra/dist/lambda"; rm -rf "$B"; mkdir -p "$B/data/catalog" "$B/data/foods" "$B/jobs/overnight/cache"
"$ROOT/node_modules/.bin/esbuild" "$ROOT/jobs/overnight/lambda.ts" --bundle --platform=node --target=node22 --format=esm \
  --outfile="$B/jobs/overnight/dist/lambda/index.mjs" --log-level=warning \
  --banner:js="import{createRequire}from'module';const require=createRequire(import.meta.url);"
cp "$ROOT/data/catalog/catalog.json" "$B/data/catalog/"; cp "$ROOT/data/foods/foods.json" "$B/data/foods/"
cp "$ROOT/jobs/overnight/cache/overnight-cache.json" "$B/jobs/overnight/cache/"
(cd "$B" && rm -f ../lambda.zip && zip -qr ../lambda.zip .)
cfn deploy --stack-name "$JOBS" --template-file jobs.yaml --capabilities CAPABILITY_IAM --parameter-overrides "${COMMON[@]}" ScheduleState="${SCHEDULE_STATE:-DISABLED}"
aws lambda update-function-code --region "$REGION" --function-name "$FN" --zip-file "fileb://$ROOT/infra/dist/lambda.zip" --query LastUpdateStatus --output text
aws lambda wait function-updated --region "$REGION" --function-name "$FN"

echo "== 5/5 write .env.aws"
ENC=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$ARN")
cat > "$ROOT/.env.aws" <<ENV
# Written by infra/deploy.sh $(date -u +%Y-%m-%dT%H:%M:%SZ) (git-ignored). Image tag $TAG.
MCP_URL=https://bedrock-agentcore.$REGION.amazonaws.com/runtimes/$ENC/invocations?qualifier=DEFAULT
MCP_AUTH=sigv4
AGENTCORE_RUNTIME_ARN=$ARN
AURORA_CLUSTER_ARN=$AURORA_CLUSTER_ARN
AURORA_SECRET_ARN=$AURORA_SECRET_ARN
AURORA_DATABASE=$AURORA_DATABASE
OVERNIGHT_LAMBDA=$FN
OVERNIGHT_SCHEDULE=$(out "$JOBS" ScheduleName)
ENV
cat "$ROOT/.env.aws"
