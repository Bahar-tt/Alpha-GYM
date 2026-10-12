# ── Stage 1: Build frontend ──────────────────────────────────────────────
FROM node:20-bookworm AS frontend-builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY postcss.config.js tailwind.config.js ./
COPY public ./public
COPY src ./src

# Empty VITE_API_URL → frontend uses relative URLs (same origin as API)
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ── Stage 2: Backend runtime ─────────────────────────────────────────────
FROM node:20-bookworm

WORKDIR /app

# better-sqlite3 needs native build tools
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Install backend deps (npm install because lock may lag behind package.json)
COPY backend/package.json ./backend/
WORKDIR /app/backend
RUN npm install --omit=dev

# Copy backend source
WORKDIR /app
COPY backend/ ./backend/

# Copy built frontend
COPY --from=frontend-builder /app/dist ./dist

# Persistent data directory (DB + uploads). Mount a volume/disk at /app/data
RUN mkdir -p /app/data/uploads

ENV NODE_ENV=production
ENV PORT=8000
ENV DATA_DIR=/app/data
ENV DB_PATH=/app/data/gym.db

EXPOSE 8000

WORKDIR /app/backend
CMD ["node", "server.js"]
