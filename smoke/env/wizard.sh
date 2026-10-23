#!/usr/bin/env bash
# T-00 human-step wizard. One step at a time; each step is checked before moving on.
cd "$(dirname "$0")/../.."
set -a; [ -f .env.local ] && . ./.env.local; set +a
export AWS_PROFILE="${AWS_PROFILE:-hirz-login}" R="${AWS_REGION:-us-east-1}"
step() { echo; echo "== $1"; echo "$2"; until eval "$3" >/dev/null 2>&1; do read -rp "Not done yet. Press Enter to re-check (Ctrl-C to quit)... "; done; echo "OK"; }

step "1. Sign in to AWS" "Run: aws login --profile hirz-login" \
  "aws sts get-caller-identity"

step "2. Bedrock model access (Nova only, D21)" \
  "If a model below is not AUTHORIZED, open https://us-east-1.console.aws.amazon.com/bedrock/home?region=us-east-1#/modelaccess and enable: Nova 2 Pro (or strongest Nova), Nova 2 Lite, Nova 2.5 Sonic, Nova 2 Sonic. Accept any terms." \
  "bash smoke/env/check.sh | grep -E 'reasoning model|voice model ' | grep -vq FAIL"

echo; echo "== 3. AWS Budget USD 50 with email alert at 80% (approved; needs an email)"
ACCT=$(aws sts get-caller-identity --query Account --output text)
if aws budgets describe-budgets --account-id "$ACCT" --query 'Budgets[].BudgetName' --output text | grep -q dayform-50; then echo OK; else
  read -rp "Alert email (blank to skip): " EMAIL
  [ -n "$EMAIL" ] && aws budgets create-budget --account-id "$ACCT" \
    --budget '{"BudgetName":"dayform-50","BudgetLimit":{"Amount":"50","Unit":"USD"},"TimeUnit":"MONTHLY","BudgetType":"COST"}' \
    --notifications-with-subscribers "[{\"Notification\":{\"NotificationType\":\"ACTUAL\",\"ComparisonOperator\":\"GREATER_THAN\",\"Threshold\":80,\"ThresholdType\":\"PERCENTAGE\"},\"Subscribers\":[{\"SubscriptionType\":\"EMAIL\",\"Address\":\"$EMAIL\"}]}]" && echo OK
fi

echo; echo "== 4. CDK bootstrap (APPROVAL NEEDED; creates the CDKToolkit stack, an S3 bucket, an ECR repo and IAM roles)"
ACCT=$(aws sts get-caller-identity --query Account --output text)
read -rp "Run 'npx aws-cdk@latest bootstrap aws://$ACCT/$R' now? [y/N] " a
[ "$a" = y ] && npx -y aws-cdk@latest bootstrap "aws://$ACCT/$R"

echo; echo "== 5. ARM64 build path: native linux/arm64 on Apple Silicon (no machine change)"
docker buildx build --platform linux/arm64 -q -f smoke/env/Dockerfile.arm64 smoke/env && echo OK

echo; bash smoke/env/check.sh
