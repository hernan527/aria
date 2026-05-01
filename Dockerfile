# ── Etapa 1: Build React ──────────────────────────────────────────────────────
FROM node:20.9.0-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json ./
RUN pnpm install

COPY . .
RUN pnpm run build

# ── Etapa 2: Backend Node.js + React estático ─────────────────────────────────
FROM node:20.9.0-alpine AS runtime

WORKDIR /app

# Instalar dependencias del servidor
COPY server/package.json ./server/
RUN cd server && npm install --omit=dev

# Copiar servidor, flows y dist
COPY server/ ./server/
COPY flows/ ./flows/
COPY --from=builder /app/dist ./dist

EXPOSE 4000

CMD ["node", "server/index.js"]
