# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Dependencies zuerst (Layer-Cache nutzen)
COPY package*.json ./
RUN npm ci

# Quellcode kopieren & SSR-Build
COPY . .
RUN npm run build:ssr

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

# Nur production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Build-Output aus Stage 1 kopieren
COPY --from=builder /app/dist ./dist

EXPOSE 4000

CMD ["node", "dist/eks-website/server/server.mjs"]
