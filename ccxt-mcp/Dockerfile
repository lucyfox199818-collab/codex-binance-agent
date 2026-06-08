FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

LABEL org.opencontainers.image.source="https://github.com/lucyfox199818-collab/codex-binance-agent"
LABEL org.opencontainers.image.description="Dry-run-first CCXT MCP server for Codex market, account, and guarded trading tools"
LABEL io.modelcontextprotocol.server.name="io.github.lucyfox199818-collab/ccxt-mcp"

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

CMD ["node", "dist/index.js"]
