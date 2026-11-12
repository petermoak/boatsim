import React, { useState } from 'react';
import { useSimStore } from '../stores/simStore';
import { usePGNStore } from '../stores/pgnStore';
import { useEditorStore, draftFromDefaults } from '../stores/editorStore';
import { simApi } from '../services/sim';

// Pick, save and reset scenarios. The scenario runs on the server; switching is
// only allowed while stopped.
const ScenarioBar: React.FC = () => {
  const { scenario, scenarios, running, finished, dirty, connected, simulatedPgns } = useSimStore();
  const editing = useEditorStore(s => s.active);
  const [busy, setBusy] = useState(false);

  // New route from the global PGN defaults (PGN Database "defaults" tab).
  const handleDefine = () => {
    const { pgnDefinitions, pgnDefault } = usePGNStore.getState();
    useEditorStore.getState().open(draftFromDefaults(pgnDefinitions, pgnDefault, simulatedPgns));
  };

  // Edit the loaded scenario as saved (not the live, unsaved edits).
  const handleEdit = () => run(async () => {
    if (!scenario) return;
    const saved = await simApi.getScenario(scenario.id);
    useEditorStore.getState().open({ id: saved.id, name: saved.name, waypoints: saved.waypoints, pgns: saved.pgns });
  });

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSelect = (id: string) => {
    if (!id || id === scenario?.id) return;
    if (dirty && !window.confirm(`Discard unsaved changes to "${scenario?.name}"?`)) return;
    run(() => simApi.load(id));
  };

  const handleSaveAs = () => {
    const name = window.prompt('Save scenario as:', scenario ? `${scenario.name} copy` : 'New scenario');
    if (name && name.trim()) run(() => simApi.save(name.trim()));
  };

  const status = !connected ? 'offline' : running ? (finished ? 'arrived' : 'running') : 'stopped';

  return (
    <div className="scenario-bar" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <select
        value={scenario?.id ?? ''}
        onChange={(e) => handleSelect(e.target.value)}
        disabled={running || busy || editing}
        title={running ? 'Stop the simulation to switch scenarios' : 'Scenario'}
        style={{ maxWidth: 220 }}
      >
        {!scenario && <option value="">Loading…</option>}
        {scenarios.map(s => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <button className="blue-button" onClick={handleDefine} disabled={busy || editing}
              title="Draw a new route on the chart">
        Define sim
      </button>
      <button className="blue-button" onClick={handleEdit} disabled={busy || editing || !scenario}
              title="Change this scenario's route and waypoint values">
        Edit route
      </button>
      <button className="blue-button" onClick={() => run(() => simApi.save())} disabled={!dirty || busy}
              title="Save current PGN values, rates and streams into this scenario">
        Save{dirty ? '*' : ''}
      </button>
      <button className="blue-button" onClick={handleSaveAs} disabled={busy || !scenario}>
        Save as…
      </button>
      <button className="blue-button" onClick={() => run(() => simApi.reset())} disabled={busy || !scenario}
              title="Move the boat back to the first waypoint">
        Restart
      </button>
      <span className={`scenario-status scenario-status-${status}`} style={{ fontSize: 12, opacity: 0.8 }}>
        {status}
      </span>
    </div>
  );
};

export default ScenarioBar;
