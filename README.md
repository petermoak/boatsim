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
console on the **Signal K** container and run (npm there refuses to install straight from a URL, so
download the file into `~/.signalk` first; keep it there, npm references it on later installs):

```bash
cd ~/.signalk
node -e 'fetch("http://<pi-ip>:5010/signalk-plugin.tgz").then(r=>{if(r.status!==200)throw new Error(r.status);return r.arrayBuffer()}).then(b=>require("fs").writeFileSync("signalk-boatsim-injector.tgz",Buffer.from(b))).then(()=>console.log("saved"))'
npm install ./signalk-boatsim-injector.tgz
```

Restart the Signal K container, then in the Signal K admin UI go to **Server → Plugin Config →
Boatsim N2K Injector**, enable it, and keep port `10112` unless it clashes.

The plugin also adds **Boatsim** to Signal K's **Webapps** menu; it opens boatsim on port 5010 of the
same host (append `?port=NNNN` to its URL if you publish a different port).

**App Dock:** with `@signalk/app-dock` installed, open **Plugin Config → App Dock**, click
**Discover Installed Webapps**, and enable **Boatsim**. Double-tap anywhere in boatsim to bring
up the dock and switch to Freeboard-SK or other apps (boatsim forwards its taps to the dock,
since it runs on a different port).

To update the plugin later, redeploy the boatsim stack and repeat the same three commands.

Boatsim reaches the plugin over the Docker network Signal K is on (`serendipity` on the Pi), by
Signal K's container name. The stack joins that network; set `SIGNALK_HOST` (container name,
default `signalk`) and `DOCKER_NETWORK` (default `serendipity`) in the stack's environment
variables if yours differ. No port needs publishing on the Signal K container.

### 2. Run boatsim as a Portainer stack

**Stacks → Add stack → Repository**: this repo's URL, the branch to deploy, and compose path
`docker-compose.yml`. Portainer builds the image on the Pi (the first build takes several
minutes). Then open `http://<pi-ip>:5010`.

Settings (environment variables in `docker-compose.yml`):

| Variable | Default | Purpose |
|---|---|---|
| `SIGNALK_HOST` | `signalk` | Signal K container name (where the injector plugin listens) |
| `DOCKER_NETWORK` | `serendipity` | Existing Docker network shared with Signal K |
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
