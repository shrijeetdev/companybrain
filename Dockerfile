# One image, one process — the whole companybrain app. No sidecar DB/Redis/web containers.
# Build:  docker build -t companybrain .
# Run:    docker run -p 4317:4317 -v companybrain-data:/root/.companybrain --env-file .env companybrain
FROM node:20-bookworm-slim

# Build tools for the better-sqlite3 native module.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Install deps first (cached unless manifests change).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY cli/package.json ./cli/
COPY packages ./packages
RUN pnpm install --frozen-lockfile

# App source.
COPY . .

ENV COMPANYBRAIN_PORT=4317
ENV COMPANYBRAIN_HOST=0.0.0.0
EXPOSE 4317

# SQLite data persists here — mount a volume so it survives restarts/redeploys.
VOLUME ["/root/.companybrain"]

CMD ["pnpm", "start"]
