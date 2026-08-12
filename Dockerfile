# ── Stage 1: Build Backend Dependencies ─────
FROM node:20-slim AS backend-builder

WORKDIR /app

COPY package*.json ./
RUN apt-get update && apt-get install -y python3 make g++ && npm ci --only=production

# ── Stage 2: Build Frontend ─────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ── Stage 3: Production ─────────────────────
FROM node:20-slim

WORKDIR /app

# Security: run as non-root
RUN groupadd -r appgroup && useradd -r -g appgroup appuser

# Copy dependencies from builder
COPY --from=backend-builder /app/node_modules ./node_modules
COPY package*.json ./
COPY src/ ./src/
COPY --from=frontend-builder /app/client/dist ./public/

# Create data and model cache directories with correct permissions
RUN mkdir -p /app/data /app/.cache && chown -R appuser:appgroup /app

USER appuser

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["dumb-init", "node", "src/server.js"]