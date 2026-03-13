FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY packages/db/package.json ./packages/db/
COPY packages/auth/package.json ./packages/auth/
COPY packages/tenant/package.json ./packages/tenant/
COPY packages/feature-flags/package.json ./packages/feature-flags/
COPY apps/inventory-server/package.json ./apps/inventory-server/

RUN npm ci --workspace=apps/inventory-server --workspace=packages/db \
    --workspace=packages/auth --workspace=packages/tenant \
    --workspace=packages/feature-flags

COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/inventory-server/ ./apps/inventory-server/

# Cache buster — change this value to force a fresh build layer
ARG CACHEBUST=3

RUN npm run build -w packages/db && \
    npm run build -w packages/auth && \
    npm run build -w packages/tenant && \
    npm run build -w packages/feature-flags && \
    npm run build -w apps/inventory-server

# ── Production image ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S gadnuc && adduser -S gadnuc -G gadnuc

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/db/package.json          ./packages/db/
COPY --from=builder /app/packages/db/dist                  ./packages/db/dist
COPY --from=builder /app/packages/db/src/migrations        ./packages/db/dist/migrations
COPY --from=builder /app/packages/auth/package.json        ./packages/auth/
COPY --from=builder /app/packages/auth/dist                ./packages/auth/dist
COPY --from=builder /app/packages/tenant/package.json      ./packages/tenant/
COPY --from=builder /app/packages/tenant/dist              ./packages/tenant/dist
COPY --from=builder /app/packages/feature-flags/package.json  ./packages/feature-flags/
COPY --from=builder /app/packages/feature-flags/dist          ./packages/feature-flags/dist
COPY --from=builder /app/apps/inventory-server/dist        ./apps/inventory-server/dist

USER gadnuc
EXPOSE 3001

CMD ["node", "apps/inventory-server/dist/index.js"]
