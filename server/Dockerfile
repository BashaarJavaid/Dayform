# MCP server image (ARM64, AgentCore container contract: 0.0.0.0:8000, POST /mcp). Build context: the repo root.
#   docker buildx build --platform linux/arm64 -f server/Dockerfile -t dayform-server .
FROM node:23-slim
WORKDIR /app
COPY . .
RUN npm ci --workspace @dayform/server --workspace @dayform/db --include-workspace-root --no-audit --no-fund \
  && npm cache clean --force
ENV PORT=8000
EXPOSE 8000
CMD ["npx", "tsx", "server/src/main.ts"]
