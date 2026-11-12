# Boatsim

Boat simulator that moves a boat along waypoints and emits NMEA 2000 PGNs. The simulation runs
in the boatsim server, so a scenario keeps running with no browser open; the browser UI (map,
scenario picker, PGN values, rates, emit log) is a control panel. The server sends PGNs to two
independent outputs, each switchable in the UI's **Outputs** menu:

```
                                     ┌─ Signal K data feed (TCP 2603) ──> Signal K ──> dashboards, Freeboard
boatsim scenario runner (server) ────┤
        ▲ controls/edits (Socket.IO) └─ bus output (TCP 10112) ──> injector plugin ──> NGX ──> N2K bus ──> MFD
   browser UI
```

## Scenarios

A scenario is a named route (waypoints) plus the PGNs it sends, with their values, rates and
whether each one streams. Pick one in the scenario list next to **Start Simulation**:

- **Start / Stop** runs or pauses the loaded scenario. It keeps running if you close the browser
  or switch apps. Only one scenario runs at a time; switch scenarios while stopped.
- Edits to PGN values, rates and stream checkboxes apply live. **Save** writes them into the
  scenario; **Save as…** makes a new named copy.
- **Restart** puts the boat back at the first waypoint. The boat stops at the last waypoint
  (speed drops to 0); pressing Start again replays from the beginning.
- On first start boatsim creates **Halifax loop** from the old saved waypoints and PGN defaults.
  After a container restart the last loaded scenario is loaded again, stopped.

Scenarios are stored as JSON in the `boatsim-data` volume (`/data/scenarios`). Drawing new routes on
the chart is the next phase.

- **Signal K data** makes boatsim a virtual NMEA 2000 gateway. Signal K decodes every PGN as if it
  came off the bus. Works with the bus powered off.
- **N2K bus** puts the PGNs on the physical network through Signal K's Actisense, so MFDs and other
  bus devices see them. Signal K does not see these (the gateway doesn't echo what it transmits),
  which is why the data feed exists.

## Deploy on the Pi (HAOS + Portainer)

### 1. Run boatsim as a Portainer stack

**Stacks → Add stack → Repository**: this repo's URL, the branch to deploy, and compose path
`docker-compose.yml`. Portainer builds the image on the Pi (the first build takes several
minutes). Then open `http://<pi-ip>:5010`.

Boatsim joins the Docker network Signal K is on (`serendipity` on the Pi), so the two reach each
other by container name and no ports beyond 5010 need publishing.

Settings (environment variables in the Portainer stack):

| Variable | Default | Purpose |
|---|---|---|
| `DOCKER_NETWORK` | `serendipity` | Existing Docker network shared with Signal K |
| `SIGNALK_FEED_ENABLED` | `true` | Start the Signal K data feed (ports 2603/2600) |
| `SIGNALK_HOST` | `signalk` | Signal K container name (where the injector plugin listens) |
| `SIGNALK_INJECTOR_PORT` | `10112` | Injector plugin TCP port |
| `SIGNALK_AUTOCONNECT` | `true` | Connect the bus output on startup |
| `BOATSIM_N2K_SOURCE` | `100` | N2K source address stamped on simulated PGNs |
| `BOATSIM_PORT` | `5010` | Port for UI, API and Socket.IO |

Scenarios, PGN defaults and the last loaded scenario persist in the `boatsim-data` volume.

### 2. Signal K data feed (dashboards, Freeboard)

In the Signal K admin UI: **Server → Data Connections → Add**:

- **Data Type:** NMEA 2000
- **NMEA 2000 Source:** canboat-pipeline CSV (canboatjs)
- **Host:** `boatsim` · **Port:** `2603` · **Input Port:** `2600` (or leave empty)
- **ID:** e.g. `boatsim`

Save and restart if prompted. Boatsim's **Outputs** menu shows "1 Signal K connection" once it's
attached. Boatsim sends a keepalive while idle, so the connection stays up when the sim is stopped.

### 3. Bus output (MFDs and other bus devices)

Boatsim can't open the Actisense itself because Signal K already holds it, so a small plugin
(`signalk-plugin/`) receives boatsim's messages and hands them to Signal K's N2K connection.

The plugin is downloadable from the running boatsim stack. In Portainer, open a console on the
**Signal K** container and run (npm there refuses to install straight from a URL, so download the
file into `~/.signalk` first; keep it there, npm references it on later installs):

```bash
cd ~/.signalk
node -e 'fetch("http://<pi-ip>:5010/signalk-plugin.tgz").then(r=>{if(r.status!==200)throw new Error(r.status);return r.arrayBuffer()}).then(b=>require("fs").writeFileSync("signalk-boatsim-injector.tgz",Buffer.from(b))).then(()=>console.log("saved"))'
npm install ./signalk-boatsim-injector.tgz
```

Restart the Signal K container, then in the Signal K admin UI go to **Server → Plugin Config →
Boatsim N2K Injector**, enable it, and keep port `10112` unless it clashes. To update the plugin
later, redeploy the boatsim stack and repeat the same three commands.

The plugin also adds **Boatsim** to Signal K's **Webapps** menu; it opens boatsim on port 5010 of the
same host (append `?port=NNNN` to its URL if you publish a different port).

**App Dock:** with `@signalk/app-dock` installed, open **Plugin Config → App Dock**, click
**Discover Installed Webapps**, and enable **Boatsim**. Double-tap anywhere in boatsim to bring
up the dock and switch to Freeboard-SK or other apps (boatsim forwards its taps to the dock,
since it runs on a different port).

## Things to know

- **Boat speed** is the 128259 "Speed Water Referenced" value (m/s); change it live to change speed.
- **Competing sources.** Simulated data competes with real sources for the same values: in Signal K
  (e.g. `signalk-fixedstation`, a real GPS or wind instrument) and on the bus (MFDs pick a source
  per data type). Use Signal K's **Source Priorities**, and don't simulate PGNs a real device on
  the bus is already sending.
- **Gateway transmit list.** The Actisense only transmits PGNs on its transmit list. canboatjs enables
  126992, 127250, 127257, 127488, 127489, 127502, 127505, 127506, 127508, 128259, 128267, 129025,
  129026, 129029, 129038, 129041, 129794, 130306, 130311, 130312 and 126720 by default. Other PGNs are
  dropped by the gateway unless added to the Signal K connection's transmit list. (The Signal K
  data feed has no such limit.)

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
