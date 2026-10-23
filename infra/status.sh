#!/usr/bin/env bash
# T-40: read-only status of the deployed stacks, runtime, cluster, Lambda and schedule.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a; . "$ROOT/.env.local"; [ -f "$ROOT/.env.aws" ] && . "$ROOT/.env.aws"; set +a
R=${AWS_REGION:-us-east-1}
for s in dayform-server dayform-jobs; do
  printf '%-16s %s\n' "$s" "$(aws cloudformation describe-stacks --region "$R" --stack-name "$s" --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo MISSING)"; done
ID=${AGENTCORE_RUNTIME_ARN##*/}
[ -n "$ID" ] && aws bedrock-agentcore-control get-agent-runtime --region "$R" --agent-runtime-id "$ID" \
  --query '{runtime:agentRuntimeName,status:status,version:agentRuntimeVersion,image:agentRuntimeArtifact.containerConfiguration.containerUri}' --output table
aws rds describe-db-clusters --region "$R" --db-cluster-identifier dayform-db \
  --query 'DBClusters[0].{cluster:DBClusterIdentifier,status:Status,engine:EngineVersion,dataApi:HttpEndpointEnabled,minACU:ServerlessV2ScalingConfiguration.MinCapacity,maxACU:ServerlessV2ScalingConfiguration.MaxCapacity}' --output table
aws lambda get-function-configuration --region "$R" --function-name dayform-overnight --query '{lambda:FunctionName,state:State,runtime:Runtime,updated:LastModified}' --output table 2>/dev/null
aws scheduler get-schedule --region "$R" --name dayform-overnight --query '{schedule:Name,state:State,cron:ScheduleExpression,tz:ScheduleExpressionTimezone}' --output table 2>/dev/null
