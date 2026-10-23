#!/usr/bin/env bash
# T-04 Aurora PostgreSQL Serverless v2 + Data API.  APPROVAL NEEDED before `create`.
# Usage: smoke/aurora/create-cluster.sh check|create|wait|env|teardown
# Engine: 17.11 is the newest version listed as Data API-capable (docs list Aurora PG 17.4+ in us-east-1;
# Aurora PG 18.x exists but the Data API version table has no PG 18 column; see FRICTION).
# Network: no VPC args -> default VPC + default subnet group. Data API needs no VPC access from callers.
set -euo pipefail
: "${AWS_PROFILE:=hirz-operator}" "${AWS_REGION:=us-east-1}"
export AWS_PROFILE AWS_REGION
CLUSTER=dayform-db
INSTANCE=dayform-db-1
ENGINE_VERSION="${ENGINE_VERSION:-17.11}"

case "${1:-}" in
  check)  # read-only: confirm the engine version is offered in the region
    aws rds describe-db-engine-versions --engine aurora-postgresql \
      --query 'DBEngineVersions[].EngineVersion' --output text | tr '\t' '\n' | sort -V | tail -8 ;;
  create)
    aws rds create-db-cluster \
      --db-cluster-identifier "$CLUSTER" \
      --engine aurora-postgresql \
      --engine-version "$ENGINE_VERSION" \
      --database-name dayform \
      --master-username postgres \
      --manage-master-user-password \
      --serverless-v2-scaling-configuration MinCapacity=0.5,MaxCapacity=4 \
      --enable-http-endpoint \
      --storage-encrypted \
      --no-deletion-protection \
      --tags Key=project,Value=dayform
    aws rds create-db-instance \
      --db-instance-identifier "$INSTANCE" \
      --db-cluster-identifier "$CLUSTER" \
      --engine aurora-postgresql \
      --db-instance-class db.serverless \
      --tags Key=project,Value=dayform ;;
  wait)
    aws rds wait db-cluster-available --db-cluster-identifier "$CLUSTER"
    aws rds wait db-instance-available --db-instance-identifier "$INSTANCE"
    echo "available" ;;
  env)  # print the lines to append to .env.local
    aws rds describe-db-clusters --db-cluster-identifier "$CLUSTER" \
      --query 'DBClusters[0].[DBClusterArn,MasterUserSecret.SecretArn,EngineVersion,HttpEndpointEnabled]' --output text |
      awk '{print "AURORA_CLUSTER_ARN="$1"\nAURORA_SECRET_ARN="$2"\nAURORA_DATABASE=dayform\n# engine="$3" http_endpoint="$4}' ;;
  teardown)  # deletes instance, then cluster; the RDS-managed secret is deleted with the cluster
    aws rds delete-db-instance --db-instance-identifier "$INSTANCE" --skip-final-snapshot
    aws rds wait db-instance-deleted --db-instance-identifier "$INSTANCE"
    aws rds delete-db-cluster --db-cluster-identifier "$CLUSTER" --skip-final-snapshot
    aws rds wait db-cluster-deleted --db-cluster-identifier "$CLUSTER" ;;
  *) echo "usage: $0 check|create|wait|env|teardown" >&2; exit 2 ;;
esac
