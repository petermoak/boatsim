import React, { useState } from 'react';
import { useEditorStore, editableValues, SPEED_PGN, SPEED_FIELD } from '../stores/editorStore';
import { usePGNStore } from '../stores/pgnStore';
import { useSimStore } from '../stores/simStore';
import { simApi } from '../services/sim';
import { PGNField } from '../types';

// Panel shown over the map while defining or editing a scenario route.
const panelStyle: React.CSSProperties = {
  position: 'absolute', top: 10, right: 10, zIndex: 1000,
  width: 'min(360px, calc(100vw - 32px))', maxHeight: 'calc(100% - 20px)', overflowY: 'auto',
  background: '#fff', color: '#222', borderRadius: 8, boxShadow: '0 2px 12px rgba(0,0,0,.35)',
  padding: 12, fontSize: 13,
};
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, margin: '4px 0' };
const inputStyle: React.CSSProperties = { flex: 1, minWidth: 0, padding: '3px 5px' };

const ScenarioEditor: React.FC = () => {
  const { draft, selected, dirty, select, setName, deleteWaypoint, renameWaypoint, setWaypointValue, close } = useEditorStore();
  const { pgnDefinitions } = usePGNStore();
  const { running, scenario: loaded } = useSimStore();
  const [saving, setSaving] = useState(false);

  if (!draft) return null;
  const wp = selected != null ? draft.waypoints[selected] : null;
  const editable = editableValues(draft.pgns);

  const handleSave = async () => {
    let name = draft.name.trim();
    if (!name) name = (window.prompt('Name this scenario:') || '').trim();
    if (!name) return;
    if (draft.waypoints.length < 2) {
      alert('Add at least two waypoints (right-click or press and hold on the chart).');
      return;
    }
    setSaving(true);
    try {
      const saved = await simApi.saveScenario({ id: draft.id, name, waypoints: draft.waypoints, pgns: draft.pgns });
      close();
      const isLoaded = loaded?.id === saved.id;
      if (!isLoaded && !running && window.confirm(`Saved "${saved.name}". Load it now?`)) {
        await simApi.load(saved.id);
      } else if (isLoaded && running) {
        alert(`Saved "${saved.name}". The running simulation keeps the old route until you stop it and load the scenario again.`);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (dirty && !window.confirm('Discard changes to this route?')) return;
    close();
  };

  const renderField = (pgn: string, field: PGNField | undefined, name: string) => {
    if (!wp || selected == null) return null;
    const value = wp.values?.[pgn]?.[name] ?? editable[pgn]?.[name] ?? 0;
    const label = pgn === SPEED_PGN && name === SPEED_FIELD ? 'Boat speed' : (field?.Description || name);
    const key = `${selected}-${pgn}-${name}`;

    if (field?.FieldType === 'LOOKUP' && field.EnumValues?.length) {
      return (
        <div key={key} style={rowStyle}>
          <label style={{ flex: 1.2 }}>{label}</label>
          <select style={inputStyle} value={value}
                  onChange={(e) => setWaypointValue(selected, pgn, name, Number(e.target.value))}>
            {field.EnumValues.map(ev => <option key={ev.value} value={ev.value}>{ev.name}</option>)}
          </select>
        </div>
      );
    }
    return (
      <div key={key} style={rowStyle}>
        <label style={{ flex: 1.2 }}>{label}</label>
        <input
          key={key + String(value)}
          type="number"
          step={field?.Resolution || 'any'}
          defaultValue={value}
          style={inputStyle}
          onBlur={(e) => {
            const n = parseFloat(e.target.value);
            if (!isNaN(n) && n !== value) setWaypointValue(selected, pgn, name, n);
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
        <span style={{ width: 34, opacity: 0.7 }}>{field?.Unit || ''}</span>
      </div>
    );
  };

  return (
    <div style={panelStyle} onContextMenu={(e) => e.stopPropagation()}>
      <div style={{ ...rowStyle, marginBottom: 8 }}>
        <strong style={{ flex: 1 }}>{draft.id ? 'Edit route' : 'Define sim'}</strong>
        <button className="blue-button" onClick={handleSave} disabled={saving}>Save</button>
        <button className="blue-button" onClick={handleCancel} disabled={saving}>Cancel</button>
      </div>

      <div style={rowStyle}>
        <label>Name</label>
        <input style={inputStyle} value={draft.name} placeholder="Scenario name"
               onChange={(e) => setName(e.target.value)} />
      </div>

      <p style={{ margin: '6px 0', opacity: 0.75 }}>
        Right-click (or press and hold) the chart to add a waypoint. Drag to move. Click one to set
        the PGN values that apply from that waypoint on.
      </p>

      <div style={{ borderTop: '1px solid #ddd', paddingTop: 6 }}>
        {draft.waypoints.length === 0 && <div style={{ opacity: 0.6 }}>No waypoints yet.</div>}
        {draft.waypoints.map((w, i) => (
          <div key={i} onClick={() => select(i)}
               style={{ ...rowStyle, cursor: 'pointer', padding: '2px 4px', borderRadius: 4,
                        background: i === selected ? '#fff3e0' : undefined }}>
            <span style={{ width: 20, fontWeight: 'bold', color: i === selected ? '#ff9800' : '#1976d2' }}>{i + 1}</span>
            <span style={{ flex: 1 }}>{w.name}</span>
            <span style={{ opacity: 0.6, fontSize: 11 }}>{w.lat.toFixed(4)}, {w.lon.toFixed(4)}</span>
          </div>
        ))}
      </div>

      {wp && selected != null && (
        <div style={{ borderTop: '1px solid #ddd', marginTop: 8, paddingTop: 8 }}>
          <div style={rowStyle}>
            <input key={`name-${selected}`} style={inputStyle} defaultValue={wp.name}
                   onBlur={(e) => renameWaypoint(selected, e.target.value.trim() || `Waypoint ${selected + 1}`)} />
            <button className="blue-button" onClick={() => deleteWaypoint(selected)}>Delete</button>
          </div>
          <div style={{ opacity: 0.7, margin: '2px 0 6px' }}>
            {selected === 0 ? 'Values at the start of the run:' : `Values from waypoint ${selected + 1} on:`}
          </div>
          {Object.keys(editable).sort().map(pgn => {
            const def = pgnDefinitions[pgn];
            const fields = pgn === SPEED_PGN
              ? [SPEED_FIELD]
              : Object.keys(editable[pgn]).filter(n => !n.startsWith('Reserved') && n !== 'SID');
            if (fields.length === 0) return null;
            return (
              <div key={pgn} style={{ marginBottom: 8 }}>
                <div style={{ fontWeight: 'bold', marginBottom: 2 }}>
                  {pgn} {def?.Description || ''}
                </div>
                {fields.map(name => renderField(pgn, def?.Fields.find(f => f.Name === name), name))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ScenarioEditor;
