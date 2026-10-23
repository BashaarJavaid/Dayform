#!/usr/bin/env bash
# T-07 deploy. APPROVAL NEEDED: creates a Lambda, two IAM roles and a one-off EventBridge schedule (5 min ahead, Asia/Karachi).
# Usage: set -a; . ../../.env.local; set +a; ./deploy.sh        Teardown: ./deploy.sh destroy
set -euo pipefail
cd "$(dirname "$0")"
REGION=${AWS_REGION:-us-east-1}; STACK=dayform-smoke-scheduler-lambda; FN=dayform-smoke-overnight
if [ "${1:-}" = destroy ]; then aws cloudformation delete-stack --region "$REGION" --stack-name "$STACK"; aws cloudformation wait stack-delete-complete --region "$REGION" --stack-name "$STACK"; echo deleted; exit 0; fi
: "${AURORA_CLUSTER_ARN:?}" "${AURORA_SECRET_ARN:?}" "${AURORA_DATABASE:?}" "${REASONING_MODEL_ID:?}"
AT="at($(TZ=Asia/Karachi date -v+5M +%Y-%m-%dT%H:%M:00))"
echo "== 1/3 build"; npm run -s build
echo "== 2/3 stack (schedule $AT Asia/Karachi)"
aws cloudformation deploy --region "$REGION" --stack-name "$STACK" --template-file template.yaml --capabilities CAPABILITY_IAM \
  --parameter-overrides Runtime="${RUNTIME:-nodejs24.x}" ModelId="$REASONING_MODEL_ID" ClusterArn="$AURORA_CLUSTER_ARN" \
  SecretArn="$AURORA_SECRET_ARN" Database="$AURORA_DATABASE" At="$AT"
echo "== 3/3 code"
aws lambda update-function-code --region "$REGION" --function-name "$FN" --zip-file fileb://dist/lambda.zip --query LastUpdateStatus --output text
aws lambda wait function-updated --region "$REGION" --function-name "$FN"
echo "Invoke: aws lambda invoke --function-name $FN out.json"
echo "Disable: aws scheduler get-schedule --name $FN > s.json; then update-schedule with --state DISABLED"
