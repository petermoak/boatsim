import net from 'net';
import { EventEmitter } from 'events';

const KEEPALIVE_MS = 20000;          // Signal K drops the read socket after 60s idle
const MAX_BUFFERED_BYTES = 1 << 20;  // skip a slow client rather than queue forever

// Virtual NMEA 2000 gateway for Signal K's "canboat CSV" data connection.
//
// Signal K connects out to two ports, like it does to canboat-pipeline:
//   - readPort (2603): we stream every PGN as an Actisense/canboat CSV line;
//     Signal K decodes them exactly as if they came off the bus.
//   - inputPort (2600): Signal K writes its outbound PGNs here. There is no bus
//     behind us, so we accept and discard them (keeping the connection up stops
//     Signal K retrying it).
export class CsvFeed extends EventEmitter {
    constructor({ readPort = 2603, inputPort = 2600, enabled = true } = {}) {
        super();
        this.readPort = readPort;
        this.inputPort = inputPort;
        this.enabled = false;
        this.readServer = null;
        this.inputServer = null;
        this.readers = new Set();
        this.inputs = new Set();
        this.keepaliveTimer = null;
        this.lastError = null;
        if (enabled) this.start();
    }

    get path() {
        return `signalk-feed://boatsim:${this.readPort}`;
    }

    start() {
        if (this.enabled) return;
        this.enabled = true;
        this.lastError = null;

        this.readServer = net.createServer((socket) => {
            socket.setNoDelay(true);
            this.readers.add(socket);
            console.log(`Signal K feed client connected from ${socket.remoteAddress}`);
            socket.write('# format=FAST boatsim\n');
            socket.on('data', () => {});          // reads go nowhere on this port
            socket.on('error', () => {});
            socket.on('close', () => {
                this.readers.delete(socket);
                this.emit('status', this.getStatus());
            });
            this.emit('status', this.getStatus());
        });

        this.inputServer = net.createServer({ allowHalfOpen: true }, (socket) => {
            this.inputs.add(socket);
            socket.resume();                       // discard outbound PGNs from Signal K
            socket.on('error', () => {});
            socket.on('close', () => this.inputs.delete(socket));
        });

        for (const [server, port] of [[this.readServer, this.readPort], [this.inputServer, this.inputPort]]) {
            server.on('error', (err) => {
                this.lastError = `port ${port}: ${err.message}`;
                console.error(`Signal K feed ${this.lastError}`);
                this.emit('error_status', { ...this.getStatus(), error: this.lastError });
            });
            server.listen(port, '0.0.0.0');
        }
        console.log(`Signal K feed listening on ${this.readPort} (data) and ${this.inputPort} (input)`);

        this.keepaliveTimer = setInterval(() => this.write('# keepalive\n'), KEEPALIVE_MS);
        this.emit('status', this.getStatus());
    }

    stop() {
        if (!this.enabled) return;
        this.enabled = false;
        clearInterval(this.keepaliveTimer);
        for (const s of [...this.readers, ...this.inputs]) s.destroy();
        this.readers.clear();
        this.inputs.clear();
        this.readServer?.close();
        this.inputServer?.close();
        this.readServer = this.inputServer = null;
        this.emit('status', this.getStatus());
    }

    get clientCount() {
        return this.readers.size;
    }

    getStatus() {
        const n = this.clientCount;
        return {
            path: this.path,
            type: 'signalk-feed',
            status: n > 0 ? 'connected' : 'disconnected',
            enabled: this.enabled,
            detail: this.enabled
                ? (n > 0 ? `${n} Signal K connection${n === 1 ? '' : 's'}` : 'waiting for Signal K to connect')
                : 'off',
            error: this.lastError,
            timestamp: Date.now()
        };
    }

    // lines: newline-terminated Actisense CSV lines
    write(lines) {
        if (!lines) return;
        for (const socket of this.readers) {
            if (socket.writableLength > MAX_BUFFERED_BYTES) continue;
            socket.write(lines);
        }
    }
}
