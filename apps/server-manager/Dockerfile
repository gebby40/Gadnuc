FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY packages/db/package.json ./packages/db/
COPY packages/auth/package.json ./packages/auth/
COPY packages/tenant/package.json ./packages/tenant/
COPY packages/feature-flags/package.json ./packages/feature-flags/
COPY apps/server-manager/package.json ./apps/server-manager/

RUN npm ci --workspace=apps/server-manager --workspace=packages/db \
    --workspace=packages/auth --workspace=packages/tenant \
    --workspace=packages/feature-flags

COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/server-manager/ ./apps/server-manager/

RUN npm run build -w packages/db && npm run build -w packages/auth && \
    npm run build -w packages/tenant && npm run build -w packages/feature-flags && \
    npm run build -w apps/server-manager

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S gadnuc && adduser -S gadnuc -G gadnuc
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/*/dist ./packages/
COPY --from=builder /app/apps/server-manager/dist ./apps/server-manager/dist
USER gadnuc
EXPOSE 3002
CMD ["node", "apps/server-manager/dist/index.js"]
