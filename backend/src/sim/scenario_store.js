import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { STORAGE_DIR } from '../utils/paths.js';
import { getDefaults, getWaypoints } from '../utils/storage.js';
import { defaultRate, fullValues } from './pgn_definitions.js';
import { SIMULATED_PGNS } from './pgn_factory.js';

// Scenarios are JSON files in <data>/scenarios/<id>.json:
// {
//   id, name, createdAt, updatedAt,
//   waypoints: [{ name, lat, lon }],
//   pgns: { "<pgn>": { stream: bool, rate: Hz, values: { "<Field Name>": number } } }
// }
// Phase 2 adds per-waypoint PGN values.

const SCENARIO_DIR = path.join(STORAGE_DIR, 'scenarios');
fs.mkdirSync(SCENARIO_DIR, { recursive: true });

function fileFor(id) {
    if (!/^[a-z0-9-]+$/.test(id)) throw new Error('Invalid scenario id');
    return path.join(SCENARIO_DIR, `${id}.json`);
}

function slug(name) {
    const base = String(name || 'scenario').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'scenario';
    return `${base}-${crypto.randomBytes(3).toString('hex')}`;
}

function normalize(scenario) {
    const pgns = {};
    for (const [pgn, cfg] of Object.entries(scenario.pgns || {})) {
        if (!/^\d+$/.test(pgn)) continue;
        pgns[pgn] = {
            stream: cfg?.stream !== false,
            rate: Number(cfg?.rate) > 0 ? Number(cfg.rate) : defaultRate(pgn),
            values: Object.fromEntries(
                Object.entries(cfg?.values || {}).filter(([, v]) => Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)])
            )
        };
    }
    const waypoints = (scenario.waypoints || [])
        .map((w, i) => ({ name: String(w.name || `Waypoint ${i + 1}`), lat: Number(w.lat), lon: Number(w.lon) }))
        .filter(w => Number.isFinite(w.lat) && Number.isFinite(w.lon));
    return {
        id: scenario.id,
        name: String(scenario.name || 'Untitled').slice(0, 100),
        createdAt: scenario.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        waypoints,
        pgns
    };
}

export async function listScenarios() {
    const files = (await fs.promises.readdir(SCENARIO_DIR)).filter(f => f.endsWith('.json'));
    const items = [];
    for (const f of files) {
        try {
            const s = JSON.parse(await fs.promises.readFile(path.join(SCENARIO_DIR, f), 'utf8'));
            items.push({ id: s.id, name: s.name, updatedAt: s.updatedAt, waypointCount: s.waypoints?.length || 0 });
        } catch (err) {
            console.error(`Skipping unreadable scenario ${f}: ${err.message}`);
        }
    }
    return items.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getScenario(id) {
    const file = fileFor(id);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(await fs.promises.readFile(file, 'utf8'));
}

// Create (no id) or overwrite (id). Returns the saved scenario.
export async function saveScenario(scenario) {
    const existing = scenario.id ? await getScenario(scenario.id) : null;
    const id = existing ? scenario.id : slug(scenario.name);
    const saved = normalize({ ...scenario, id, createdAt: existing?.createdAt });
    await fs.promises.writeFile(fileFor(id), JSON.stringify(saved, null, 2));
    return saved;
}

export async function deleteScenario(id) {
    const file = fileFor(id);
    if (fs.existsSync(file)) await fs.promises.unlink(file);
}

// First run: turn the old global waypoints + PGN defaults into a scenario.
export async function ensureDefaultScenario() {
    const existing = await listScenarios();
    if (existing.length > 0) return existing[0].id;

    const defaults = await getDefaults();
    const { waypoints } = await getWaypoints();
    const pgns = {};
    for (const pgn of new Set([...Object.keys(defaults), ...SIMULATED_PGNS])) {
        pgns[pgn] = { stream: true, rate: defaultRate(pgn), values: fullValues(pgn, defaults[pgn] || {}) };
    }
    const saved = await saveScenario({ name: 'Halifax loop', waypoints, pgns });
    console.log(`Created default scenario "${saved.name}" (${saved.id})`);
    return saved.id;
}
