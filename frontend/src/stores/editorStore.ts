import { create } from 'zustand';
import { Waypoint, PGNDefinition, PGNDefaults } from '../types';
import { SessionPGN } from './simStore';

// Scenario editor ("Define sim" / "Edit route"). Works on a draft that is only
// sent to the server on Save; the running session is untouched until then.

// PGNs whose values the simulation computes; not editable per waypoint.
// 128259 is simulated too, but its "Speed Water Referenced" is the boat speed.
export const COMPUTED_PGNS = ['129029', '129025', '129026', '126992'];
export const SPEED_PGN = '128259';
export const SPEED_FIELD = 'Speed Water Referenced';

export interface DraftScenario {
  id: string | null;            // null = new scenario
  name: string;
  waypoints: Waypoint[];
  pgns: Record<string, SessionPGN>;
}

interface EditorStore {
  active: boolean;
  draft: DraftScenario | null;
  selected: number | null;
  dirty: boolean;

  open: (draft: DraftScenario) => void;
  close: () => void;
  select: (index: number | null) => void;
  setName: (name: string) => void;
  addWaypoint: (lat: number, lon: number) => void;
  moveWaypoint: (index: number, lat: number, lon: number) => void;
  deleteWaypoint: (index: number) => void;
  renameWaypoint: (index: number, name: string) => void;
  setWaypointValue: (index: number, pgn: string, field: string, value: number) => void;
}

// PGN field values that can be set per waypoint, for each editable PGN.
export function editableValues(pgns: Record<string, SessionPGN>): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const [pgn, cfg] of Object.entries(pgns)) {
    if (COMPUTED_PGNS.includes(pgn)) continue;
    if (pgn === SPEED_PGN) {
      out[pgn] = { [SPEED_FIELD]: Number(cfg.values?.[SPEED_FIELD]) || 0 };
      continue;
    }
    out[pgn] = { ...(cfg.values || {}) };
  }
  return out;
}

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

// New scenario from the global PGN defaults (PGN Database "defaults" tab).
export function draftFromDefaults(
  definitions: Record<string, PGNDefinition>,
  defaults: PGNDefaults,
  simulatedPgns: string[]
): DraftScenario {
  const pgns: Record<string, SessionPGN> = {};
  for (const pgn of Array.from(new Set([...Object.keys(defaults), ...simulatedPgns]))) {
    const def = definitions[pgn];
    const values: Record<string, number> = {};
    def?.Fields.forEach(f => {
      if (!f.Name.startsWith('Reserved')) values[f.Name] = defaults[pgn]?.[f.Name] ?? 0;
    });
    const interval = def?.TransmissionInterval;
    pgns[pgn] = { stream: true, rate: interval ? 1000 / interval : 1, values };
  }
  return { id: null, name: '', waypoints: [], pgns };
}

export const useEditorStore = create<EditorStore>((set) => ({
  active: false,
  draft: null,
  selected: null,
  dirty: false,

  open: (draft) => set({ active: true, draft: clone(draft), selected: null, dirty: false }),
  close: () => set({ active: false, draft: null, selected: null, dirty: false }),
  select: (selected) => set({ selected }),

  setName: (name) => set((s) => s.draft ? { draft: { ...s.draft, name }, dirty: true } : {}),

  // Appends a waypoint; it starts with a copy of the previous waypoint's values
  // (or the scenario's starting values for the first one).
  addWaypoint: (lat, lon) => set((s) => {
    if (!s.draft) return {};
    const prev = s.draft.waypoints[s.draft.waypoints.length - 1];
    const values = prev?.values ? clone(prev.values) : editableValues(s.draft.pgns);
    const waypoints = [...s.draft.waypoints, { name: `Waypoint ${s.draft.waypoints.length + 1}`, lat, lon, values }];
    return { draft: { ...s.draft, waypoints }, selected: waypoints.length - 1, dirty: true };
  }),

  moveWaypoint: (index, lat, lon) => set((s) => {
    if (!s.draft) return {};
    const waypoints = s.draft.waypoints.map((w, i) => (i === index ? { ...w, lat, lon } : w));
    return { draft: { ...s.draft, waypoints }, dirty: true };
  }),

  deleteWaypoint: (index) => set((s) => {
    if (!s.draft) return {};
    const waypoints = s.draft.waypoints.filter((_, i) => i !== index);
    return { draft: { ...s.draft, waypoints }, selected: null, dirty: true };
  }),

  renameWaypoint: (index, name) => set((s) => {
    if (!s.draft) return {};
    const waypoints = s.draft.waypoints.map((w, i) => (i === index ? { ...w, name } : w));
    return { draft: { ...s.draft, waypoints }, dirty: true };
  }),

  setWaypointValue: (index, pgn, field, value) => set((s) => {
    if (!s.draft) return {};
    const waypoints = s.draft.waypoints.map((w, i) => {
      if (i !== index) return w;
      const values = { ...(w.values || {}) };
      values[pgn] = { ...(values[pgn] || {}), [field]: value };
      return { ...w, values };
    });
    return { draft: { ...s.draft, waypoints }, dirty: true };
  }),
}));
