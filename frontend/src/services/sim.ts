import { API_HEADERS } from '../config/api';
import { getSocket } from './socket';
import { useSimStore, ScenarioSummary } from '../stores/simStore';

// Controls for the server-side simulation. REST for session/scenario actions,
// Socket.IO for frequent live edits. Results arrive back as 'sim_session'.

const base = () => process.env.REACT_APP_BACKEND_URL || '';

async function call<T = any>(method: string, url: string, body?: unknown): Promise<T> {
  const response = await fetch(`${base()}${url}`, {
    method,
    headers: API_HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `${method} ${url} failed (${response.status})`);
  return data;
}

function emit(event: string, payload: unknown) {
  getSocket()?.emit(event, payload);
}

export const simApi = {
  async refreshScenarios(): Promise<ScenarioSummary[]> {
    const scenarios = await call<ScenarioSummary[]>('GET', '/api/scenarios');
    useSimStore.getState().setScenarios(scenarios);
    return scenarios;
  },
  load: (scenarioId: string) => call('POST', '/api/sim/load', { scenarioId }),
  start: () => call('POST', '/api/sim/start'),
  stop: () => call('POST', '/api/sim/stop'),
  reset: () => call('POST', '/api/sim/reset'),
  async save(name?: string) {
    const saved = await call('POST', '/api/sim/save', name ? { name } : {});
    await simApi.refreshScenarios();
    return saved;
  },
  getScenario: (id: string) => call('GET', `/api/scenarios/${encodeURIComponent(id)}`),
  // Create (no id) or replace (id) a scenario definition.
  async saveScenario(scenario: { id: string | null; name: string; waypoints: unknown[]; pgns: unknown }) {
    const { id, ...body } = scenario;
    const saved = id
      ? await call('PUT', `/api/scenarios/${encodeURIComponent(id)}`, body)
      : await call('POST', '/api/scenarios', body);
    await simApi.refreshScenarios();
    return saved;
  },
  async deleteScenario(id: string) {
    await call('DELETE', `/api/scenarios/${encodeURIComponent(id)}`);
    await simApi.refreshScenarios();
  },

  setFields: (pgn: string, fields: Record<string, number>) => emit('sim_set_fields', { pgn, fields }),
  setRate: (pgn: string, rate: number) => emit('sim_set_rate', { pgn, rate }),
  setStream: (pgn: string, stream: boolean) => emit('sim_set_stream', { pgn, stream }),
  addPgn: (pgn: string, values: Record<string, number>, rate?: number) => emit('sim_add_pgn', { pgn, values, rate }),
  removePgn: (pgn: string) => emit('sim_remove_pgn', { pgn }),
};
