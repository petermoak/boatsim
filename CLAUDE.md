# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Boatsim simulates a boat moving along waypoints and emits NMEA 2000 PGNs onto a real N2K bus so marine displays (e.g. a Raymarine E7) see live data. It ships as **one Docker container** deployed as a Portainer stack on a Raspberry Pi running Home Assistant OS, next to a Signal K server. npm workspaces: `frontend` (React/TS, CRA via react-app-rewired) and `backend` (Node/Express/Socket.IO, ES modules, plain JS). `signalk-plugin/` is a separate CommonJS Signal K plugin, not a workspace.

Development happens on Windows (no Node or Docker is installed there); the image is built and tested on the Pi.

## Data path

The backend encodes each PGN once into an Actisense/canboat CSV line and sends it to two independent outputs (`message_forwarder.js`), toggled in the UI's Outputs menu:

```
browser UI --Socket.IO update_pgn_2000--> backend ─┬─ csv_feed.js: TCP server :2603 <── Signal K "canboat-pipeline CSV" data connection --> Signal K data model
                                                   └─ signalk_link.js: TCP client --> signalk-boatsim-injector plugin --app.emit('nmea2000out')--> Signal K's Actisense connection --> NGX --> bus
```

The feed exists because the NGX doesn't echo what it transmits, so bus output never reaches Signal K's own data. The feed works with no bus at all. Signal K's canboat-csv provider also connects to an input port (2600) to write its outbound PGNs; `csv_feed.js` accepts and discards those. It also drops the read socket after 60 s idle, hence the `#` keepalive (Signal K's parser skips `#` lines).

Signal K owns the Actisense serial port (`/dev/actisense`, connection id `ngx2k`), so boatsim never touches serial hardware. Signal K runs on the external Docker network `serendipity` with port 10112 unpublished, so the compose stack joins that network and connects by Signal K's container name (`SIGNALK_HOST`). The backend encodes each PGN with canboatjs v1 `pgnToActisenseSerialFormat` (field values keyed by display **Name**, matching the frontend's `@canboat/pgns` definitions) into `timestamp,prio,pgn,src,dst,len,hh,...` lines. The plugin validates each line and emits it. Signal K's canboatjs (v3, camelCase field ids) sends *string* `nmea2000out` messages raw, so the version/field-naming mismatch never matters. Keep it that way: don't send JSON PGNs to Signal K.

The gateway only transmits PGNs on its transmit list (canboatjs `defaultTransmitPGNs`); others are silently dropped.

## Commands

- Deploy/test: Portainer stack from this repo using `docker-compose.yml` (builds `Dockerfile` natively on the Pi). UI at `http://<pi>:5010`; the plugin tarball is served at `/signalk-plugin.tgz` for `npm install` inside the Signal K container. See README.
- Local dev (if Node is available): `npm install`, then `npm run dev` (backend nodemon + CRA dev server; needs `~/.boatsim/.env`, see `env-example`). `npm start` builds the frontend and serves it from the backend on one port.
- Frontend tests: `npm test --workspace=frontend` (single test: `-- -t "name"`). There are essentially no tests; backend and plugin have none.
- ESLint runs only through CRA (`react-app` config) during frontend start/build.

## Configuration

Backend reads env vars (container) and falls back to `~/.boatsim/.env` (dev, loaded in `index.js` *before* other modules are dynamically imported, so they see the values). Key vars: `BOATSIM_PORT` (default 5010, or `REACT_APP_BACKEND_PORT`), `SIGNALK_FEED_ENABLED`, `SIGNALK_FEED_PORT` (2603), `SIGNALK_FEED_INPUT_PORT` (2600), `BOATSIM_N2K_SOURCE` (100), `SIGNALK_HOST`, `SIGNALK_INJECTOR_PORT` (10112), `SIGNALK_AUTOCONNECT`, `BOATSIM_DATA_DIR` (saved defaults/waypoints JSON; `/data` volume in the container), `FRONTEND_BUILD_DIR`.

Frontend: when `REACT_APP_BACKEND_URL` is unset (container build), REST and Socket.IO use the page's own origin. In split dev mode `scripts/run-with-env.js` injects `PORT*`/`REACT_APP_*` from `~/.boatsim/.env` into CRA.

## Frontend architecture

**The simulation and PGN emission run in the browser, not the server.** Nothing is sent unless a UI tab is open and started; two tabs double the traffic.

1. `App.tsx` boots: `initSocket()`, loads PGN definitions (`utils/pgn_definition_loader.ts` merges `@canboat/pgns` canboat + IK + NGT), fetches defaults/waypoints from the REST API. `SIMULATED_PGNS` lists PGNs whose values the simulation computes; others come from user-edited defaults.
2. `SimulationController` drives `core/Simulation.ts` (geodesy great-circle steering toward waypoints) and writes field values into `pgnStore` via `utils/pgn_factory.ts`.
3. `EmitterController` owns `core/PGNEmitter.ts`. A Web Worker (`utils/timer.worker.ts`) runs one interval per PGN at its rate (avoids main-thread timer throttling); each tick reads `pgnStore` and emits `update_pgn_2000` and appends to `emitterStore.streamLog` (capped at 600).

Zustand stores in `frontend/src/stores/` (`pgnStore`, `emitterStore`, `deviceStore`) are often read with `getState()` outside React.

## Backend architecture

- `index.js`: Express + Socket.IO (`utils/socket_server.js`, websocket-only), REST routes (`utils/routes.js`), static frontend with SPA fallback, plugin tarball route.
- `message_forwarder.js`: receives PGN batches, tracks rates (`PgnStatsManager`), encodes once and writes to `CsvFeed` and `SignalKLink`, and broadcasts `device_status` every second.
- `csv_feed.js` / `signalk_link.js`: the two outputs. Both are exposed to the UI as "devices" through the `/api/device/{status,connect,disconnect}` shape (`{ [path]: status }`, connect/disconnect by `devicePath`), which `DeviceConnector.tsx` renders.

PGN field values from `frontend/src/utils/pgn_factory.ts` must use the exact canboat field **Name** (e.g. `"Number of SVs"`) in the definition's units (e.g. 126992 `Time` is seconds); `PGNEmitter` drops unknown names silently.
- `utils/storage.js`: defaults/waypoints persistence with built-in Halifax, NS seed data.

The Dockerfile installs backend deps with `--omit=optional` so canboatjs's native `serialport`/`socketcan` aren't built; canboatjs loads fine without them.

## Python helper scripts

`scripts/nmea_listener.py` and `scripts/tcp_listener.py` (deps in `requirements.txt`) are standalone listening tools.
