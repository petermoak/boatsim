import { EventEmitter } from 'events'
import { PgnStatsManager } from './utils/pgn_stats_manager.js';
import { SignalKLink } from './signalk_link.js';

// Receives PGN batches from the browser over Socket.IO and forwards them to
// Signal K, which owns the Actisense gateway on the N2K bus.
class MessageForwarder extends EventEmitter {
    constructor(io, signalkOptions) {
        super();
        this.io = io;
        this.statsManager = new PgnStatsManager({
            windowSeconds: 10,
            logIntervalSeconds: 1,
        });
        this.link = new SignalKLink(signalkOptions);
        this.setupSubscribers();
        this.setupPublishers();
    }

    setupSubscribers() {
        this.io.on('connection', (socket) => {
            socket.on('update_pgn_2000', (data) => {
                this.handlePGNUpdate(data);
            });

            socket.on('disconnect', (reason) => {
                console.log('Client disconnected:', {
                    id: socket.id,
                    reason: reason
                });
            });
        });
    }

    setupPublishers() {
        this.link.on('status', () => {
            this.io.emit('device_status', this.getEachDeviceStatus());
        });

        this.link.on('error_status', (status) => {
            this.io.emit('device_error', status);
        });

        this.statusInterval = setInterval(() => {
            this.io.emit('device_status', this.getEachDeviceStatus());
        }, 1000);
    }

    // Same shape the UI used for serial devices: { [path]: status }
    getEachDeviceStatus() {
        const status = this.link.getStatus();
        return { [status.path]: status };
    }

    connectDevice() {
        this.link.connect();
    }

    disconnectDevice() {
        this.link.disconnect();
    }

    handlePGNUpdate(dataArray) {
        dataArray.forEach(data => this.statsManager.updateStats(data['pgn_id']));

        if (this.link.status !== 'connected') {
            return { 'status': 'no_devices_connected' };
        }
        this.link.write(dataArray);
        return { 'status': 'success' };
    }

    cleanup() {
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
        }
        this.link.disconnect();
    }
}

export { MessageForwarder };
