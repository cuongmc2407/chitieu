# syntax=docker/dockerfile:1.7
#
# Build từ thư mục gốc repo:
#   docker build -f deploy/Dockerfile -t chitieu .
#
# Nếu build trên máy ARM (Apple Silicon) để chạy trên server x86_64, thêm
# `--platform linux/amd64` vào lệnh build — better-sqlite3 dùng file .node
# đóng gói sẵn theo đúng kiến trúc của container lúc build.

FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@12.3.4 --activate
WORKDIR /repo

# --- Cài dependencies (tách riêng để cache layer khi chỉ đổi source) -------
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/core/package.json packages/core/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

# --- Build web + server, rồi gói riêng server (chỉ dependency production) -
FROM deps AS build
COPY . .
RUN pnpm --filter @chitieu/web build
RUN pnpm --filter @chitieu/server build
RUN pnpm --filter @chitieu/server --prod deploy /out/server

# --- Runtime image tối giản, chạy bằng user thường --------------------------
FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system chitieu && useradd --system --gid chitieu --create-home --home-dir /home/chitieu chitieu

WORKDIR /app
COPY --from=build /out/server ./
COPY --from=build /repo/apps/web/dist ./web-dist

ENV NODE_ENV=production \
    PORT=3333 \
    WEB_DIST_PATH=/app/web-dist \
    DB_PATH=/data/chitieu.db \
    BACKUP_DIR=/data/backups \
    ACTUAL_DATA_DIR=/data/actual

# /data chứa DB + sao lưu — gắn volume vào đây (xem docker-compose.yml).
RUN mkdir -p /data && chown -R chitieu:chitieu /data /app
USER chitieu

EXPOSE 3333

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3333/api/health').then((r)=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

# tini làm PID 1 để nhận và chuyển tiếp SIGTERM đúng cách cho Node (tắt êm).
ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/index.mjs"]
