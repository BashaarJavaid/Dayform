#!/usr/bin/env bash
# Lists rows in smoke_overnight through the Data API. Needs AURORA_* in the env.
set -euo pipefail
aws rds-data execute-statement --resource-arn "$AURORA_CLUSTER_ARN" --secret-arn "$AURORA_SECRET_ARN" --database "$AURORA_DATABASE" \
  --sql "SELECT ran_at::text, note FROM smoke_overnight ORDER BY ran_at" --query 'records[*][*].stringValue' --output text
