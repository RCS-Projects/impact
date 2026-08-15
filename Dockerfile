FROM node:18-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:18-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:18-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S impact && adduser -S impact -G impact
COPY --from=build --chown=impact:impact /app/.next ./.next
COPY --from=build --chown=impact:impact /app/node_modules ./node_modules
COPY --from=build --chown=impact:impact /app/public ./public
COPY --from=build --chown=impact:impact /app/package.json ./package.json
COPY --from=build --chown=impact:impact /app/db ./db
COPY --from=build --chown=impact:impact /app/scripts ./scripts
COPY --from=build --chown=impact:impact /app/src ./src
COPY --from=build --chown=impact:impact /app/tsconfig.json ./tsconfig.json
COPY --from=build --chown=impact:impact /app/next.config.mjs ./next.config.mjs
RUN mkdir -p /app/data/uploads && chown -R impact:impact /app/data
USER impact
EXPOSE 3000
CMD ["npm", "run", "start"]
