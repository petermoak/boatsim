import { EventEmitter } from 'events'
import pkg from '@canboat/canboatjs';
import { PgnStatsManager } from './utils/pgn_stats_manager.js';
import { SignalKLink } from './signalk_link.js';
import { CsvFeed } from './csv_feed.js';

const { pgnToActisenseSerialFormat } = pkg;

// Receives PGN batches from the browser over Socket.IO, encodes each one once
// into an Actisense CSV line, and sends it to two independent outputs:
//   - feed: virtual gateway Signal K reads as an NMEA 2000 connection (no bus needed)
//   - link: injector plugin that transmits onto the physical bus via the NGX
class MessageForwarder extends EventEmitter {
    constructor(io, { link: linkOptions, feed: feedOptions, sourceAddress = 100 }) {
        super();
        this.io = io;
        this.sourceAddress = sourceAddress;
        this.statsManager = new PgnStatsManager({
            windowSeconds: 10,
            logIntervalSeconds: 1,
        });
        this.feed = new CsvFeed(feedOptions);
        this.link = new SignalKLink(linkOptions);
        this.setupSubscribers();
        this.setupPublishers();
    }

    get outputs() {
        return [this.feed, this.link];
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
        for (const output of this.outputs) {
            output.on('status', () => {
                this.io.emit('device_status', this.getEachDeviceStatus());
            });
            output.on('error_status', (status) => {
                this.io.emit('device_error', status);
            });
        }

        this.statusInterval = setInterval(() => {
            this.io.emit('device_status', this.getEachDeviceStatus());
        }, 1000);
    }

    // Shape the UI expects: { [path]: status }
    getEachDeviceStatus() {
        const result = {};
        for (const output of this.outputs) {
            const status = output.getStatus();
            result[status.path] = status;
        }
        return result;
    }

    findOutput(path) {
        return this.outputs.find(o => o.path === path);
    }

    connectDevice(path) {
        const output = this.findOutput(path);
        if (!output) throw new Error(`Unknown output ${path}`);
        if (output === this.feed) this.feed.start(); else this.link.connect();
    }

    disconnectDevice(path) {
        const output = this.findOutput(path);
        if (!output) throw new Error(`Unknown output ${path}`);
        if (output === this.feed) this.feed.stop(); else this.link.disconnect();
    }

    anyOutputActive() {
        return this.feed.clientCount > 0 || this.link.status === 'connected';
    }

    encode(dataArray, prio = 2, dst = 255) {
        let lines = '';
        for (const data of dataArray) {
            const pgn = parseInt(data.pgn_id);
            try {
                const line = pgnToActisenseSerialFormat({
                    pgn, prio, dst, src: this.sourceAddress, fields: data.values
                });
                if (line) lines += line + '\n';
            } catch (err) {
                console.error(`Failed to encode PGN ${pgn}: ${err.message}`);
            }
        }
        return lines;
    }

    handlePGNUpdate(dataArray) {
        dataArray.forEach(data => this.statsManager.updateStats(data['pgn_id']));

        if (!this.anyOutputActive()) {
            return { 'status': 'no_devices_connected' };
        }
        const lines = this.encode(dataArray);
        this.feed.write(lines);
        this.link.write(lines);
        return { 'status': 'success' };
    }

    cleanup() {
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
        }
        this.link.disconnect();
        this.feed.stop();
    }
}

export { MessageForwarder };
