import { createRequire } from 'module';

// Same canboat definitions the frontend uses (@canboat/pgns canboat.json), for
// default rates, field names and the names shown in the emit log.
const require = createRequire(import.meta.url);
const canboat = require('@canboat/pgns/canboat.json');

const byPgn = {};
for (const def of canboat.PGNs) {
    if (!byPgn[def.PGN]) byPgn[def.PGN] = def;
}

export function getDefinition(pgn) {
    return byPgn[Number(pgn)];
}

export function pgnId(pgn) {
    return getDefinition(pgn)?.Id || String(pgn);
}

export function defaultRate(pgn) {
    const interval = getDefinition(pgn)?.TransmissionInterval;
    return interval ? 1000 / interval : 1;
}

// Non-reserved field names, in order.
export function fieldNames(pgn) {
    const fields = getDefinition(pgn)?.Fields;
    const list = Array.isArray(fields) ? fields : fields ? [fields.Field] : [];
    return list.map(f => f.Name).filter(n => n && !n.startsWith('Reserved'));
}

// Every field set: the given values, others 0 (what the old browser emitter sent).
export function fullValues(pgn, values = {}) {
    const out = {};
    for (const name of fieldNames(pgn)) out[name] = values[name] ?? 0;
    return { ...out, ...values };
}
