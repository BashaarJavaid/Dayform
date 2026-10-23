# Mock MCP server image. Build context: the repo root (see docker-compose.yml).
FROM node:23-slim
WORKDIR /app
COPY . .
RUN npm ci --workspace @dayform/mock --include-workspace-root --no-audit --no-fund
EXPOSE 8100
CMD ["npx", "tsx", "mock/src/main.ts"]
