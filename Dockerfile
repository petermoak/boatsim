# Single-container boatsim: Express serves the built React UI, REST API and
# Socket.IO on one port, and relays PGNs to Signal K's injector plugin.
# Built natively on the Pi (linux/arm64) by Portainer from this repo.

# ---- frontend build ----
FROM node:20-bookworm-slim AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
# REACT_APP_BACKEND_URL intentionally unset: the UI talks to its own origin.
ENV GENERATE_SOURCEMAP=false \
    NODE_OPTIONS=--max-old-space-size=2048
RUN npm run build

# ---- backend deps + plugin tarball ----
FROM node:20-bookworm-slim AS backend
WORKDIR /src/backend
COPY backend/package.json ./
# Optional deps are serialport/socketcan native modules canboatjs doesn't need here.
RUN npm install --omit=dev --omit=optional --no-audit --no-fund
COPY backend/src ./src
COPY signalk-plugin /src/signalk-plugin
RUN cd /src/signalk-plugin && npm pack --silent && mv signalk-boatsim-injector-*.tgz /src/signalk-plugin.tgz

# ---- runtime ----
FROM node:20-bookworm-slim
ENV NODE_ENV=production \
    BOATSIM_PORT=5010 \
    BOATSIM_DATA_DIR=/data \
    FRONTEND_BUILD_DIR=/app/frontend/build \
    SIGNALK_PLUGIN_TARBALL=/app/signalk-plugin.tgz \
    SIGNALK_HOST=host.docker.internal \
    SIGNALK_INJECTOR_PORT=10112
WORKDIR /app
COPY --from=backend /src/backend ./backend
COPY --from=backend /src/signalk-plugin.tgz ./signalk-plugin.tgz
COPY --from=frontend /src/frontend/build ./frontend/build
RUN mkdir -p /data && chown node:node /data
USER node
# 5010: UI/API/Socket.IO. 2603/2600: Signal K "canboat CSV" feed (data/input),
# reached by Signal K over the shared Docker network, so not published.
EXPOSE 5010 2603 2600
VOLUME ["/data"]
CMD ["node", "backend/src/index.js"]
