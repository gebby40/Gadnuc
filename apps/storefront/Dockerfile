FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY packages/auth/package.json ./packages/auth/
COPY apps/storefront/package.json ./apps/storefront/

RUN npm ci --workspace=apps/storefront --workspace=packages/auth

COPY tsconfig.base.json ./
COPY packages/auth/ ./packages/auth/
COPY apps/storefront/ ./apps/storefront/

RUN npm run build -w packages/auth && npm run build -w apps/storefront

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1

RUN addgroup -S gadnuc && adduser -S gadnuc -G gadnuc

COPY --from=builder /app/apps/storefront/.next/standalone ./
COPY --from=builder /app/apps/storefront/.next/static ./apps/storefront/.next/static
COPY --from=builder /app/apps/storefront/public         ./apps/storefront/public

USER gadnuc
EXPOSE 3000
CMD ["node", "apps/storefront/server.js"]
