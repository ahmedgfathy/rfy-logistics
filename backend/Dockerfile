# syntax=docker/dockerfile:1

# ---------- dependencies ----------
FROM node:20-bookworm-slim AS deps
WORKDIR /app
# Prisma's schema engine requires OpenSSL; the slim image does not ship it.
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY prisma ./prisma
RUN npx prisma generate

# ---------- development (hot reload) ----------
FROM deps AS development
ENV NODE_ENV=development
COPY . .
RUN mkdir -p /app/uploads/quotes /app/uploads/cvs
EXPOSE 3000
ENTRYPOINT ["sh", "/app/docker-entrypoint.sh"]
CMD ["npm", "run", "dev"]

# ---------- build ----------
FROM deps AS build
COPY . .
RUN npm run build

# ---------- production ----------
FROM node:20-bookworm-slim AS production
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY prisma ./prisma
RUN npx prisma generate

COPY --from=build /app/dist ./dist
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh \
    && mkdir -p /app/uploads/quotes /app/uploads/cvs \
    && chown -R node:node /app

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
