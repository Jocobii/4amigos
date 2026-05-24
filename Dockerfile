# =============================================================================
# 4 Amigos — Dockerfile para Railway (servidor)
# Build context: raíz del monorepo
# El servidor es standalone: no tiene dependencias compartidas del workspace.
# =============================================================================

# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar sólo los manifiestos primero (capa cacheada — sólo se reinstala
# cuando cambia package.json o tsconfig.json)
COPY packages/server/package.json packages/server/tsconfig.json ./

# Instalar TODAS las dependencias (incluyendo devDeps para poder compilar TS)
RUN npm install

# Copiar el código fuente y compilar
COPY packages/server/src ./src
RUN npm run build

# ─── Stage 2: Runner (imagen de producción mínima) ────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Sólo necesitamos el package.json para que Node resuelva el módulo
COPY packages/server/package.json ./

# Instalar únicamente dependencias de producción (sin devDeps)
RUN npm install --omit=dev

# Traer el build compilado del stage anterior
COPY --from=builder /app/dist ./dist

# Railway asigna el puerto via $PORT; el servidor ya lo lee correctamente
EXPOSE 3001

CMD ["node", "dist/server.js"]
