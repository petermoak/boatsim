import net from 'net';
import { EventEmitter } from 'events';

// TCP client to the signalk-boatsim-injector plugin (see /signalk-plugin), which
// transmits each Actisense CSV line onto the N2K bus through Signal K's gateway.
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
        return `signalk-bus://${this.host}:${this.port}`;
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
            type: 'n2k-bus',
            status: this.status,
            enabled: this.enabled,
            detail: !this.enabled
                ? 'off'
                : this.status === 'connected'
                    ? 'to N2K bus via Signal K gateway'
                    : 'retrying injector plugin',
            error: this.lastError,
            timestamp: Date.now()
        };
    }

    // lines: newline-terminated Actisense CSV lines
    write(lines) {
        if (this.status !== 'connected' || !this.socket || !lines) return;
        this.socket.write(lines);
    }
}
