import { create } from 'zustand';
import { BoatState, Waypoint } from '../types';

// Mirror of the server-side simulation session (backend/src/sim/sim_runner.js).
// The server is the source of truth; this store only reflects what it sends.

export interface SessionPGN {
  stream: boolean;
  rate: number;
  values: Record<string, number>;
}

export interface SimSession {
  scenario: { id: string; name: string; waypoints: Waypoint[] } | null;
  pgns: Record<string, SessionPGN>;
  simulatedPgns: string[];
  running: boolean;
  finished: boolean;
  dirty: boolean;
  boat: BoatState;
  targetIndex: number;
}

export interface ScenarioSummary {
  id: string;
  name: string;
  updatedAt: string;
  waypointCount: number;
}

interface SimStore extends SimSession {
  connected: boolean;
  scenarios: ScenarioSummary[];
  setSession: (session: SimSession) => void;
  setTick: (tick: { running: boolean; finished: boolean; boat: BoatState; targetIndex: number }) => void;
  setScenarios: (scenarios: ScenarioSummary[]) => void;
  setConnected: (connected: boolean) => void;
}

export const useSimStore = create<SimStore>((set) => ({
  connected: false,
  scenario: null,
  pgns: {},
  simulatedPgns: [],
  running: false,
  finished: false,
  dirty: false,
  boat: { lat: 0, lon: 0, heading: 0, speed_mps: 0 },
  targetIndex: 0,
  scenarios: [],

  setSession: (session) => set({ ...session }),
  setTick: ({ running, finished, boat, targetIndex }) => set({ running, finished, boat, targetIndex }),
  setScenarios: (scenarios) => set({ scenarios }),
  setConnected: (connected) => set({ connected }),
}));
