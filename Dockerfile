# Small, multi-stage image for the CutDesk web app.
# Uses Next.js standalone output so the final image ships only the server bundle
# and its runtime deps — no full node_modules, no build toolchain.
# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The control room's address (e.g. http://192.168.1.10:8200), baked into the
# frame-ancestors header so CutDesk opens in a House of Stix window.
ARG CONTROL_ROOM_ORIGIN=""
ENV DOCKER_STANDALONE=1 NEXT_TELEMETRY_DISABLED=1 CONTROL_ROOM_ORIGIN=$CONTROL_ROOM_ORIGIN
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
# Standalone output + the static assets and public files it references.
COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1:3000/health.json >/dev/null || exit 1
CMD ["node", "server.js"]
