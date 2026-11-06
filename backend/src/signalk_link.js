import net from 'net';
import { EventEmitter } from 'events';
import pkg from '@canboat/canboatjs';

const { pgnToActisenseSerialFormat } = pkg;

// TCP client to the signalk-boatsim-injector plugin (see /signalk-plugin).
// Each PGN is encoded here into an Actisense text line and sent newline-delimited;
// Signal K passes the line to its Actisense gateway unchanged.
export class SignalKLink extends EventEmitter {
    constructor({ host, port, enabled = true }) {
        super();
        this.host = host;
        this.port = port;
        this.enabled = enabled;
        this.status = 'disconnected';
        this.socket = null;
        this.reconnectTimer = null;
        this.reconnectDelay = 1000;
        this.lastError = null;
        if (this.enabled) this.connect();
    }

    get path() {
        return `signalk://${this.host}:${this.port}`;
    }

    connect() {
        this.enabled = true;
        if (this.socket) return;
        clearTimeout(this.reconnectTimer);

        const socket = net.createConnection({ host: this.host, port: this.port });
        this.socket = socket;
        socket.setNoDelay(true);

        socket.on('connect', () => {
            console.log(`Connected to Signal K injector at ${this.host}:${this.port}`);
            this.reconnectDelay = 1000;
            this.lastError = null;
            this.setStatus('connected');
        });

        socket.on('error', (err) => {
            if (this.lastError !== err.message) {
                console.error(`Signal K link error: ${err.message}`);
                this.lastError = err.message;
                this.emit('error_status', { ...this.getStatus(), error: err.message });
            }
        });

        socket.on('close', () => {
            this.socket = null;
            this.setStatus('disconnected');
            if (this.enabled) {
                this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay);
                this.reconnectDelay = Math.min(this.reconnectDelay * 2, 15000);
            }
        });
    }

    disconnect() {
        this.enabled = false;
        clearTimeout(this.reconnectTimer);
        if (this.socket) this.socket.destroy();
    }

    setStatus(status) {
        if (this.status === status) return;
        this.status = status;
        this.emit('status', this.getStatus());
    }

    getStatus() {
        return {
            path: this.path,
            type: 'signalk',
            status: this.status,
            enabled: this.enabled,
            error: this.lastError,
            timestamp: Date.now()
        };
    }

    // dataArray: [{ pgn_id, values }] as sent by the frontend PGNEmitter
    write(dataArray, prio = 2, dst = 255) {
        if (this.status !== 'connected' || !this.socket) return 0;
        let lines = '';
        for (const data of dataArray) {
            const pgn = parseInt(data.pgn_id);
            try {
                const line = pgnToActisenseSerialFormat({ pgn, prio, dst, fields: data.values });
                if (line) lines += line + '\n';
            } catch (err) {
                console.error(`Failed to encode PGN ${pgn}: ${err.message}`);
            }
        }
        if (lines) this.socket.write(lines);
        return lines.length;
    }
}
