# HomeApp image – builds everything inside Docker straight from a Git checkout:
#   docker compose up -d --build      (or: docker build -t homeapp:latest .)
# Nothing has to be installed or built beforehand: the npm packages and the frontend are built in the
# stages below. Old Docker versions on which `npm ci` aborts with "Exit handler never called!" (some
# Synology models) can use Dockerfile.prebuilt instead, see README → Fehlersuche.

# ---------------------------------------------------------------------------
# Stage 1: build the React frontend (Vite + Tailwind)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS client-build
WORKDIR /build/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
# the frontend shows version and release notes from the changelog (src/lib/version.ts)
COPY CHANGELOG.md /build/CHANGELOG.md
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2: install production dependencies of the Node.js backend
# ---------------------------------------------------------------------------
FROM node:22-alpine AS server-deps
WORKDIR /build/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# ---------------------------------------------------------------------------
# Stage 3: small runtime image
# ---------------------------------------------------------------------------
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    PUBLIC_DIR=/app/public
WORKDIR /app

COPY --from=server-deps /build/server/node_modules ./node_modules
COPY server/package.json ./package.json
COPY server/src ./src
COPY --from=client-build /build/client/dist ./public

# ffmpeg converts the RTSP camera of Bambu Lab X1/H2/P2S printers into MJPEG
RUN apk add --no-cache openssl ffmpeg && mkdir -p /data
VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node --input-type=module -e "import { httpsEnabled } from './src/tls.js'; const protocol = httpsEnabled() ? 'https' : 'http'; const { get } = await import('node:' + protocol); get(protocol + '://127.0.0.1:' + (process.env.PORT || 8080) + '/api/health', { rejectUnauthorized: false }, r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1));" || exit 1

CMD ["node", "src/index.js"]
