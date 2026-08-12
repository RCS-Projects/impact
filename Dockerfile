FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd --system --gid 1001 impact && useradd --system --uid 1001 --gid impact impact
COPY --from=builder --chown=impact:impact /app/.next/standalone ./
COPY --from=builder --chown=impact:impact /app/.next/static ./.next/static
COPY --from=builder --chown=impact:impact /app/public ./public
USER impact
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "server.js"]

