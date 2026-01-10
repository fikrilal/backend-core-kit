# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY apps ./apps
COPY libs ./libs

RUN npm run prisma:generate
RUN npm run build
RUN npm prune --omit=dev

FROM base AS api
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma

USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --retries=10 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/apps/api/src/main.js"]

FROM base AS worker
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma

USER node
EXPOSE 4001
HEALTHCHECK --interval=10s --timeout=3s --retries=10 CMD node -e "fetch('http://127.0.0.1:'+(process.env.WORKER_PORT||4001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/apps/worker/src/main.js"]
