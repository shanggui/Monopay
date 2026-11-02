# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install --global pnpm@12.14.0
WORKDIR /app

FROM base AS deps
# better-sqlite3 may need to compile if no prebuilt binary is available.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ledger-core/package.json packages/ledger-core/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @monopay/web build \
 && pnpm --filter @monopay/server build \
 && pnpm --filter @monopay/server deploy --prod /out/server

FROM node:24-bookworm-slim AS runner
ARG APP_VERSION=0.0.0
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV APP_VERSION=$APP_VERSION
ENV DB_PATH=/data/monopay.db
ENV WEB_DIST=/app/web
WORKDIR /app
RUN mkdir -p /data /backup && chown -R node:node /data /backup
COPY --from=build --chown=node:node /out/server ./
COPY --from=build --chown=node:node /app/apps/server/scripts /app/scripts
COPY --from=build --chown=node:node /app/apps/web/dist /app/web
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
