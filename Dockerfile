FROM node:20-slim AS backend-builder

WORKDIR /app

COPY package*.json ./
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && npm ci --omit=dev

FROM node:20-slim AS frontend-builder

WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends dumb-init \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -r appgroup && useradd -r -g appgroup appuser

COPY --from=backend-builder /app/node_modules ./node_modules
COPY package*.json ./
COPY src/ ./src/
COPY --from=frontend-builder /app/client/dist ./public/

RUN mkdir -p /app/data /app/.cache && chown -R appuser:appgroup /app

USER appuser

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
