# ──────────────────────────────────────────────────────────────
# From the Trunk — Production Dockerfile
#
# Multi-stage build optimized for Next.js + Payload CMS.
# Final image is ~250MB (Node.js slim + production deps only).
#
# Build:  docker build -t ftt .
# Run:    docker run -p 3000:3000 --env-file .env ftt
# ──────────────────────────────────────────────────────────────

# ── Stage 1: Install dependencies ─────────────────────────────
FROM node:20-slim AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps --production=false

# ── Stage 2: Build the application ────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env vars (non-secret, needed for Next.js static analysis)
ENV NEXT_TELEMETRY_DISABLED=1

# These are required at build time but values are overridden at runtime
ARG DATABASE_URL=postgres://build:build@localhost:5432/build
ARG PAYLOAD_SECRET=build-placeholder
ARG NEXTAUTH_SECRET=build-placeholder
ARG NEXT_PUBLIC_SERVER_URL=[REDACTED]

ENV DATABASE_URL=${DATABASE_URL}
ENV PAYLOAD_SECRET=${PAYLOAD_SECRET}
ENV NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
ENV NEXT_PUBLIC_SERVER_URL=${NEXT_PUBLIC_SERVER_URL}
ENV BUILD_STANDALONE=true

RUN npm run build

# ── Stage 3: Production image ─────────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Media upload directory (mount a volume in production)
RUN mkdir -p /app/public/media && chown nextjs:nodejs /app/public/media

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
