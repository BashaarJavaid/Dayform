# ARM64 image for AgentCore Runtime. Build: docker buildx build --platform linux/arm64 -t dayform-smoke-mcp .
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.ts ./
EXPOSE 8000
CMD ["npx", "tsx", "server.ts"]
