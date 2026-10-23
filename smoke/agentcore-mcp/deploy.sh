#!/usr/bin/env bash
# T-03 deploy to AgentCore Runtime. APPROVAL NEEDED: creates an ECR repo, an IAM role and a runtime.
# Usage: AWS_PROFILE=<profile> [TAG=<new tag> to roll a new image] ./deploy.sh        Teardown: ./deploy.sh destroy
set -euo pipefail
cd "$(dirname "$0")"
REGION=${AWS_REGION:-us-east-1}; STACK=dayform-smoke-agentcore-mcp; TAG=${TAG:-t03}
# A non-"destroy" first argument is the image tag: ./deploy.sh t03b
if [ -n "${1:-}" ] && [ "$1" != destroy ]; then TAG=$1; fi
if [ "${1:-}" = destroy ]; then aws cloudformation delete-stack --region "$REGION" --stack-name "$STACK"; aws cloudformation wait stack-delete-complete --region "$REGION" --stack-name "$STACK"; echo deleted; exit 0; fi
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REPO="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/dayform-smoke-mcp"
deploy() { aws cloudformation deploy --region "$REGION" --stack-name "$STACK" --template-file template.yaml \
  --capabilities CAPABILITY_IAM --parameter-overrides CreateRuntime="$1" ImageTag="$TAG"; }
# Pass 1 only on first deploy; on an existing stack it would delete the runtime.
if aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" >/dev/null 2>&1; then echo "== 1/3 stack exists, skip"
else echo "== 1/3 ECR repo + execution role"; deploy false; fi
echo "== 2/3 build and push linux/arm64 image $REPO:$TAG"
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"
docker buildx build --platform linux/arm64 --provenance=false -t "$REPO:$TAG" --push .
echo "== 3/3 AgentCore runtime"; deploy true
ARN=$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='RuntimeArn'].OutputValue" --output text)
echo "AGENT_RUNTIME_ARN=$ARN"
echo "Test: AGENT_RUNTIME_ARN=$ARN npx tsx client.ts --target agentcore"
