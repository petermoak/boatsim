import fs from 'fs';
import path from 'path';
import { STORAGE_DIR } from '../utils/paths.js';
import { Simulation } from './simulation.js';
import { SIMULATED_PGNS, simulatedValues } from './pgn_factory.js';
import { defaultRate, fullValues, pgnId } from './pgn_definitions.js';
import { ensureDefaultScenario, getScenario, saveScenario } from './scenario_store.js';

const TICK_MS = 200;          // boat movement
const BROADCAST_MS = 500;     // boat state to UIs
const LOG_FLUSH_MS = 500;     // emit-log lines to UIs
const SESSION_FILE = path.join(STORAGE_DIR, 'session.json');

function clone(x) {
    return JSON.parse(JSON.stringify(x));
}

function logTimestamp(d) {
    return d.toISOString().replace('T', ' ').replace('Z', '');
}

// Runs one scenario at a time on the server, so it keeps going with no browser
// open. Browsers are views/controls: they get the session over Socket.IO and
// send edits back. The session is the loaded scenario plus unsaved live edits.
export class SimRunner {
    constructor(io, forwarder) {
        this.io = io;
        this.forwarder = forwarder;
        this.scenario = null;        // { id, name, waypoints }
        this.pgns = {};              // { pgn: { stream, rate, values } }
        this.running = false;
        this.dirty = false;
        this.speedInput = 0;         // boat speed setting (128259 "Speed Water Referenced"), m/s
        this.sim = new Simulation([]);
        this.tickTimer = null;
        this.broadcastTimer = null;
        this.emitTimers = {};
        this.logBuffer = [];
        this.lastTick = 0;

        setInterval(() => this.flushLog(), LOG_FLUSH_MS);
        this.setupSockets();
    }

    async init() {
        let id = null;
        try {
            id = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')).scenarioId;
        } catch {
            // no saved session
        }
        if (!id || !(await getScenario(id))) id = await ensureDefaultScenario();
        await this.load(id);
    }

    //// Session ////

    async load(id) {
        const scenario = await getScenario(id);
        if (!scenario) throw new Error(`Scenario ${id} not found`);
        this.stop();
        this.scenario = { id: scenario.id, name: scenario.name, waypoints: scenario.waypoints };
        this.pgns = clone(scenario.pgns || {});
        for (const pgn of SIMULATED_PGNS) {
            if (!this.pgns[pgn]) this.pgns[pgn] = { stream: true, rate: defaultRate(pgn), values: fullValues(pgn) };
        }
        this.speedInput = Number(this.pgns['128259']?.values?.['Speed Water Referenced']) || 0;
        this.sim.setWaypoints(scenario.waypoints);
        this.applySimulatedValues();
        this.dirty = false;
        try {
            fs.writeFileSync(SESSION_FILE, JSON.stringify({ scenarioId: id }));
        } catch (err) {
            console.error(`Could not remember session: ${err.message}`);
        }
        console.log(`Loaded scenario "${scenario.name}" (${id})`);
        this.broadcastSession();
    }

    // Save live values/rates/streams into the loaded scenario, or a new one if name given.
    async save({ name } = {}) {
        const base = await getScenario(this.scenario.id);
        const scenario = {
            ...(base || {}),
            id: name ? undefined : this.scenario.id,
            name: name || this.scenario.name,
            waypoints: this.scenario.waypoints,
            pgns: this.pgnsForSaving()
        };
        const saved = await saveScenario(scenario);
        this.scenario = { id: saved.id, name: saved.name, waypoints: saved.waypoints };
        this.dirty = false;
        fs.writeFileSync(SESSION_FILE, JSON.stringify({ scenarioId: saved.id }));
        this.broadcastSession();
        return saved;
    }

    start() {
        if (this.running) return;
        if (this.sim.finished) this.sim.reset();
        this.running = true;
        this.lastTick = Date.now();
        this.tickTimer = setInterval(() => this.tick(), TICK_MS);
        this.broadcastTimer = setInterval(() => this.broadcastTick(), BROADCAST_MS);
        this.restartEmitters();
        console.log(`Simulation started: ${this.scenario?.name}`);
        this.broadcastSession();
    }

    stop() {
        if (!this.running) return;
        this.running = false;
        clearInterval(this.tickTimer);
        clearInterval(this.broadcastTimer);
        this.stopEmitters();
        console.log('Simulation stopped');
        this.broadcastSession();
    }

    // Back to the first waypoint without changing values.
    reset() {
        const wasRunning = this.running;
        this.stop();
        this.sim.reset();
        this.applySimulatedValues();
        if (wasRunning) this.start(); else this.broadcastSession();
    }

    //// Simulation ////

    tick() {
        const now = Date.now();
        const dt = (now - this.lastTick) / 1000;
        this.lastTick = now;
        const wasFinished = this.sim.finished;
        this.sim.step(dt, this.speedInput);
        this.applySimulatedValues();
        if (!wasFinished && this.sim.finished) {
            console.log('Reached the last waypoint');
            this.broadcastSession();
        }
    }

    // The 128259 values sent on the bus follow the boat (0 once finished); the
    // user's speed setting is kept separately so arriving doesn't overwrite it.
    applySimulatedValues() {
        const boat = { ...this.sim.boat, speed_mps: this.sim.finished ? 0 : this.speedInput };
        const values = simulatedValues(boat);
        for (const [pgn, fields] of Object.entries(values)) {
            if (!this.pgns[pgn]) continue;
            this.pgns[pgn].values = { ...this.pgns[pgn].values, ...fields };
        }
    }

    // pgns with the user's speed setting in place of the live boat speed.
    pgnsForSaving() {
        const out = clone(this.pgns);
        if (out['128259']) {
            out['128259'].values['Speed Water Referenced'] = this.speedInput;
            out['128259'].values['Speed Ground Referenced'] = this.speedInput;
        }
        return out;
    }

    //// Emission ////

    restartEmitters() {
        this.stopEmitters();
        if (!this.running) return;
        for (const [pgn, cfg] of Object.entries(this.pgns)) {
            if (!cfg.stream) continue;
            const interval = Math.max(20, 1000 / (Number(cfg.rate) || 1));
            this.emitTimers[pgn] = setInterval(() => this.emit(pgn), interval);
        }
    }

    stopEmitters() {
        Object.values(this.emitTimers).forEach(clearInterval);
        this.emitTimers = {};
    }

    emit(pgn) {
        const cfg = this.pgns[pgn];
        if (!cfg) return;
        const values = cfg.values;
        if ((pgn === '129029' || pgn === '129025') && (!values.Latitude || !values.Longitude)) return;

        this.forwarder.send([{ pgn_id: pgn, values }]);

        const fields = Object.entries(values).map(([k, v]) => `${k}:${v}`).join(' | ');
        this.logBuffer.push(`${logTimestamp(new Date())} ${pgn} ${pgnId(pgn)} {${fields}}`);
    }

    flushLog() {
        if (this.logBuffer.length === 0) return;
        const lines = this.logBuffer.splice(0, this.logBuffer.length).slice(-600);
        this.io.emit('pgn_log', lines);
    }

    //// Edits from the UI ////

    setFields(pgn, fields) {
        if (!this.pgns[pgn] || typeof fields !== 'object') return;
        const clean = Object.fromEntries(
            Object.entries(fields).filter(([, v]) => Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)])
        );
        this.pgns[pgn].values = { ...this.pgns[pgn].values, ...clean };
        if (pgn === '128259' && 'Speed Water Referenced' in clean) {
            this.speedInput = clean['Speed Water Referenced'];
            this.applySimulatedValues();
        }
        this.dirty = true;
        this.broadcastSession();
    }

    setRate(pgn, rate) {
        if (!this.pgns[pgn] || !(Number(rate) > 0)) return;
        this.pgns[pgn].rate = Number(rate);
        this.dirty = true;
        this.restartEmitters();
        this.broadcastSession();
    }

    setStream(pgn, stream) {
        if (!this.pgns[pgn]) return;
        this.pgns[pgn].stream = !!stream;
        this.dirty = true;
        this.restartEmitters();
        this.broadcastSession();
    }

    addPgn(pgn, values = {}, rate) {
        pgn = String(pgn);
        if (!/^\d+$/.test(pgn) || this.pgns[pgn]) return;
        this.pgns[pgn] = { stream: false, rate: Number(rate) > 0 ? Number(rate) : defaultRate(pgn), values: fullValues(pgn, values) };
        this.dirty = true;
        this.broadcastSession();
    }

    removePgn(pgn) {
        if (!this.pgns[pgn] || SIMULATED_PGNS.includes(pgn)) return;
        delete this.pgns[pgn];
        this.dirty = true;
        this.restartEmitters();
        this.broadcastSession();
    }

    //// Broadcasting ////

    snapshot() {
        return {
            scenario: this.scenario,
            pgns: this.pgns,
            simulatedPgns: SIMULATED_PGNS,
            running: this.running,
            finished: this.sim.finished,
            dirty: this.dirty,
            boat: this.sim.boat,
            targetIndex: this.sim.targetIndex
        };
    }

    broadcastSession() {
        this.io.emit('sim_session', this.snapshot());
    }

    broadcastTick() {
        const simulated = {};
        for (const pgn of SIMULATED_PGNS) simulated[pgn] = this.pgns[pgn]?.values;
        this.io.emit('sim_tick', {
            running: this.running,
            finished: this.sim.finished,
            boat: this.sim.boat,
            targetIndex: this.sim.targetIndex,
            values: simulated
        });
    }

    setupSockets() {
        this.io.on('connection', (socket) => {
            if (this.scenario) socket.emit('sim_session', this.snapshot());
            socket.on('sim_set_fields', ({ pgn, fields } = {}) => this.setFields(String(pgn), fields));
            socket.on('sim_set_rate', ({ pgn, rate } = {}) => this.setRate(String(pgn), rate));
            socket.on('sim_set_stream', ({ pgn, stream } = {}) => this.setStream(String(pgn), stream));
            socket.on('sim_add_pgn', ({ pgn, values, rate } = {}) => this.addPgn(pgn, values, rate));
            socket.on('sim_remove_pgn', ({ pgn } = {}) => this.removePgn(String(pgn)));
        });
    }
}
