# HomeApp runtime image.
#
# This build runs NO npm inside the container (that failed on some Synology Docker versions with
# "npm error Exit handler never called!"). Instead the project folder already contains
#   - server/node_modules   (pure JavaScript packages, no native code -> platform independent)
#   - client/dist           (the built frontend)
# Rebuild them on a PC with `npm install` / `npm run build` when the code changes.
# For a fully self-contained build see Dockerfile.full.
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    PUBLIC_DIR=/app/public
WORKDIR /app

COPY server/package.json ./package.json
COPY server/node_modules ./node_modules
COPY server/src ./src
COPY client/dist ./public

# Configuration and history live in a volume so that updates keep them.
# The container runs as root on purpose: a bind-mounted ./data folder that Docker creates on the
# Synology belongs to root, and an unprivileged user could not write config.json into it.
# ffmpeg converts the RTSP camera of Bambu Lab X1/H2/P2S printers into MJPEG
RUN apk add --no-cache openssl ffmpeg && mkdir -p /data
VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node --input-type=module -e "import { httpsEnabled } from './src/tls.js'; const protocol = httpsEnabled() ? 'https' : 'http'; const { get } = await import('node:' + protocol); get(protocol + '://127.0.0.1:' + (process.env.PORT || 8080) + '/api/health', { rejectUnauthorized: false }, r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1));" || exit 1

CMD ["node", "src/index.js"]
