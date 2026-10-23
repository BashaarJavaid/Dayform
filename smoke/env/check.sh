#!/usr/bin/env bash
# T-00 environment check. Prints PASS/FAIL per line. Reads .env.local.
cd "$(dirname "$0")/../.."
set -a; [ -f .env.local ] && . ./.env.local; set +a
R="${AWS_REGION:-us-east-1}"
line() { if eval "$2" >/dev/null 2>&1; then echo "PASS  $1"; else echo "FAIL  $1${3:+  (fallback: $3)}"; fi; }
converse() { aws bedrock-runtime converse --region "$R" --model-id "$1" \
  --messages '[{"role":"user","content":[{"text":"hi"}]}]' --inference-config '{"maxTokens":1}'; }
sonic() { aws bedrock get-foundation-model-availability --region "$R" --model-id "$1" \
  --query 'authorizationStatus=="AUTHORIZED" && entitlementAvailability=="AVAILABLE" && regionAvailability=="AVAILABLE"' --output text | grep -q True; }

line "credentials ($AWS_PROFILE) and region $R" "aws sts get-caller-identity && [ \"\$(aws configure get region)\" = us-east-1 -o -n \"\$AWS_REGION\" ]"
line "reasoning model $REASONING_MODEL_ID (converse)" "converse $REASONING_MODEL_ID" "REASONING_MODEL_FALLBACK_ID"
line "reasoning fallback $REASONING_MODEL_FALLBACK_ID (converse)" "converse $REASONING_MODEL_FALLBACK_ID" "Nova Pro / Premier"
line "voice model $VOICE_MODEL_ID (availability)" "sonic $VOICE_MODEL_ID" "VOICE_MODEL_FALLBACK_ID"
line "voice fallback $VOICE_MODEL_FALLBACK_ID (availability)" "sonic $VOICE_MODEL_FALLBACK_ID" "Sonic in us-west-2"
line "CDK bootstrap stack CDKToolkit in $R" "aws cloudformation describe-stacks --region $R --stack-name CDKToolkit --query 'Stacks[0].StackStatus' --output text | grep -q COMPLETE"
line "ARM64 build path (local buildx, linux/arm64)" "docker buildx build --platform linux/arm64 -q -f smoke/env/Dockerfile.arm64 smoke/env" "CodeBuild"
line "Docker daemon" "docker info"
