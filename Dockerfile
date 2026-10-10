# companybrain — one image, one process (SQLite + scheduler + API + MCP + web UI).
#
#   docker build -t companybrain .
#   docker run -d -p 4317:4317 -v companybrain-data:/data --env-file .env companybrain
#
# All state (database, encryption key, VAPID keys, WhatsApp session) lives in /data.

# ---- build ------------------------------------------------------------------
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY cli/package.json cli/
COPY packages/types/package.json packages/types/
COPY packages/nlp/package.json packages/nlp/
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
COPY packages/integrations/package.json packages/integrations/
COPY packages/mcp/package.json packages/mcp/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Production runtime deps only: the bundle needs better-sqlite3 (native) and, optionally,
# the WhatsApp QR library. Install them into a clean folder.
RUN mkdir /runtime && cd /runtime \
  && node -e "const p=require('/app/package.json');const i=require('/app/packages/integrations/package.json');require('fs').writeFileSync('package.json',JSON.stringify({name:'cb-runtime',private:true,type:'module',dependencies:{'better-sqlite3':p.dependencies['better-sqlite3']},optionalDependencies:i.optionalDependencies||{}}))" \
  && npm install --omit=dev --no-audit --no-fund

# ---- runtime ----------------------------------------------------------------
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    COMPANYBRAIN_HOST=0.0.0.0 \
    COMPANYBRAIN_PORT=4317 \
    COMPANYBRAIN_DB_PATH=/data/companybrain.sqlite
WORKDIR /app

COPY --from=build /runtime/node_modules ./node_modules
COPY --from=build /runtime/package.json ./package.json
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.js ./server.js

RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 4317

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.COMPANYBRAIN_PORT||4317)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

STOPSIGNAL SIGTERM
CMD ["node", "server.js"]
