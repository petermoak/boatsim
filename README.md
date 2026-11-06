# Boatsim

Boat simulator that moves a boat along waypoints and emits NMEA 2000 PGNs onto a real N2K bus.
The browser UI (map, PGN selection, rates, emit log) generates the PGNs; the server forwards them to
Signal K, which transmits them through its Actisense gateway.

```
browser UI --Socket.IO--> boatsim container --TCP 10112--> Signal K plugin --> Actisense NGX --> N2K bus
```

## Deploy on the Pi (HAOS + Portainer)

### 1. Install the Signal K plugin

Boatsim can't open the Actisense itself because Signal K already holds it, so a small plugin
(`signalk-plugin/`) receives boatsim's messages and hands them to Signal K's N2K connection.

After the boatsim stack is running (step 2), the plugin is downloadable from it. In Portainer, open a
console on the **Signal K** container and run:

```bash
cd ~/.signalk && npm install http://<pi-ip>:5010/signalk-plugin.tgz
```

Restart the Signal K container, then in the Signal K admin UI go to **Server → Plugin Config →
Boatsim N2K Injector**, enable it, and keep port `10112` unless it clashes.

The boatsim container must be able to reach that port:
- Signal K on **host networking**: nothing else to do.
- Signal K on **bridge networking**: publish `10112:10112` on the Signal K container, or put both
  containers on the same Docker network and set `SIGNALK_HOST` to the Signal K container name.

### 2. Run boatsim as a Portainer stack

**Stacks → Add stack → Repository**: this repo's URL, the branch to deploy, and compose path
`docker-compose.yml`. Portainer builds the image on the Pi (the first build takes several
minutes). Then open `http://<pi-ip>:5010`.

Settings (environment variables in `docker-compose.yml`):

| Variable | Default | Purpose |
|---|---|---|
| `SIGNALK_HOST` | `host.docker.internal` | Where the injector plugin listens |
| `SIGNALK_INJECTOR_PORT` | `10112` | Plugin TCP port |
| `SIGNALK_AUTOCONNECT` | `true` | Connect to Signal K on startup |
| `BOATSIM_PORT` | `5010` | Port for UI, API and Socket.IO |

Saved PGN defaults and waypoints persist in the `boatsim-data` volume.

## Things to know

- **Emission runs in the browser.** PGNs are only sent while a browser tab has the UI open and is
  started. Two open tabs send everything twice.
- **Gateway transmit list.** The Actisense only transmits PGNs on its transmit list. canboatjs enables
  126992, 127250, 127257, 127488, 127489, 127502, 127505, 127506, 127508, 128259, 128267, 129025,
  129026, 129029, 129038, 129041, 129794, 130306, 130311, 130312 and 126720 by default. Other PGNs are
  dropped by the gateway unless added to the Signal K connection's transmit list.
- **Live bus safety.** Simulated position/heading competes with real instruments on the same bus.

## Local development

Requires Node 18+. Create `~/.boatsim/.env` (`npm run create-config`, or copy `env-example`), then:

```bash
npm install
npm run dev
```

This runs the backend (nodemon) and the CRA dev server separately; `REACT_APP_BACKEND_URL` in the
env file points the UI at the backend.

## License

MIT
