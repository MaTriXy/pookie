# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS deps
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY patches ./patches
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

FROM node:${NODE_VERSION} AS builder
RUN corepack enable
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY . .
# Next 16 stat()s .env.local during build; .dockerignore excludes it for
# secret-hygiene, so create an empty placeholder to satisfy the stat call.
RUN touch apps/api/.env.local
# env.ts runs at import time during `next build`, and the Slack adapter
# validates its own secrets at module load when bot.ts gets imported during
# page-data collection. Both happen in the build container which has no real
# secrets — feed them dummy non-empty strings here. Runtime values come from
# the platform's env on container start.
ENV NEXT_TELEMETRY_DISABLED=1 \
    SKIP_ENV_VALIDATION=1 \
    BUILD_STANDALONE=1 \
    SLACK_CLIENT_ID=build \
    SLACK_CLIENT_SECRET=build \
    SLACK_SIGNING_SECRET=build \
    REDIS_URL=redis://localhost:6379 \
    BASE_URL=http://localhost:3000
RUN pnpm --filter api build

FROM node:${NODE_VERSION} AS runner
WORKDIR /app
# IS_SELF_DEPLOYED defaults to true for all Docker-based self-hosts (Railway,
# Fly, Render, DO, AWS, plain docker-compose). Switches /install from the
# cloud marketing flow to the post-deploy setup wizard. Override at the
# platform level with IS_SELF_DEPLOYED=false if you're hosting your own
# managed instance.
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 IS_SELF_DEPLOYED=true
RUN addgroup -S nodejs -g 1001 && adduser -S -u 1001 -G nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /repo/apps/api/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/api/.next/static ./apps/api/.next/static
# Next standalone output omits /public — copy it explicitly so assets like
# /pookie.jpeg resolve at runtime the way they do under `next start`.
COPY --from=builder --chown=nextjs:nodejs /repo/apps/api/public ./apps/api/public
USER nextjs
EXPOSE 3000
CMD ["node", "apps/api/server.js"]
