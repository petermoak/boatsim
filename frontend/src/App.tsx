import { useState, useEffect, useCallback } from 'react';
import './App.css';
// Stores
import { usePGNStore } from './stores/pgnStore';
import { useEmitterStore } from './stores/emitterStore';
import { useSimStore } from './stores/simStore';

// Components
import Map from './components/Map';
import PGNPanel from './components/PGNPanel';
import PGNDatabase from './components/PGNDatabase';
import DeviceConnector from './components/DeviceConnector';
import StreamLogPanel from './components/StreamLogPanel';

// Services / utils
import { initSocket, applySession } from './services/socket';
import { simApi } from './services/sim';
import { loadPGNConfig } from './utils/pgn_definition_loader';
import { getDefaultPGNs } from './utils/pgn_defaults_loader';

// The simulation runs on the server (backend/src/sim). This UI shows the loaded
// scenario's session and sends controls and edits back.
function App() {
  const { initializePGNStore } = usePGNStore();
  const { toggleStreamLog, showStreamLog } = useEmitterStore();
  const { boat, scenario, pgns, simulatedPgns, running } = useSimStore();

  const [isDatabaseViewerOpen, setIsDatabaseViewerOpen] = useState(false);
  const [isDeviceMenuOpen, setIsDeviceMenuOpen] = useState(false);
  const [hasConnectedDevices, setHasConnectedDevices] = useState(false);

  const selectedPGNs = Object.keys(pgns);
  const waypoints = scenario?.waypoints ?? [];

  useEffect(() => {
    initSocket();
    simApi.refreshScenarios().catch(err => console.error('Error loading scenarios:', err));
    Promise.all([loadPGNConfig(), getDefaultPGNs()])
      .then(([config, defaults]) => {
        initializePGNStore(config, defaults);
        // A session may have arrived before the definitions; apply it on top.
        const session = useSimStore.getState();
        if (session.scenario) applySession(session);
      })
      .catch(error => console.error('Error initializing application:', error));
  }, [initializePGNStore]);

  const handleSelectedPGNsChange = (newSelectedPGNs: string[]) => {
    const current = new Set(selectedPGNs);
    const next = new Set(newSelectedPGNs);
    const { pgnState, pgnRates } = usePGNStore.getState();
    newSelectedPGNs.filter(pgn => !current.has(pgn))
      .forEach(pgn => simApi.addPgn(pgn, pgnState[pgn] || {}, pgnRates[pgn]));
    selectedPGNs.filter(pgn => !next.has(pgn))
      .forEach(pgn => simApi.removePgn(pgn));
  };

  const handleConnectionStatusChange = useCallback((hasConnections: boolean) => {
    setHasConnectedDevices(hasConnections);
  }, []);

  const handleAddToSimulation = (pgn: string) => {
    if (!selectedPGNs.includes(pgn)) handleSelectedPGNsChange([...selectedPGNs, pgn]);
  };

  const reportError = (err: unknown) => alert(err instanceof Error ? err.message : String(err));

  return (
    <div className="App">
      <div className="main-container">
        <div className="map-container">
          <Map
            boatState={boat}
            waypoints={waypoints}
          />
        </div>
        <PGNPanel
          selectedPGNs={selectedPGNs}
          simulatedPGNs={simulatedPgns}
          onSelectedPGNsChange={handleSelectedPGNsChange}
          onStart={() => { simApi.start().catch(reportError); }}
          onStop={() => { simApi.stop().catch(reportError); }}
          isSimulating={running}
          onOpenDatabase={() => setIsDatabaseViewerOpen(true)}
          onToggleDeviceMenu={() => setIsDeviceMenuOpen(!isDeviceMenuOpen)}
          onToggleEmitLogs={toggleStreamLog}
          hasConnectedDevices={hasConnectedDevices}
        />
      </div>
      {isDatabaseViewerOpen && (
        <PGNDatabase
          isOpen={isDatabaseViewerOpen}
          onClose={() => setIsDatabaseViewerOpen(false)}
          pgnDefinitions={usePGNStore.getState().pgnDefinitions}
          selectedPGNs={selectedPGNs}
          onAddToSimulation={handleAddToSimulation}
        />
      )}
      {isDeviceMenuOpen && (
        <DeviceConnector
          className="device-menu-overlay"
          onClose={() => setIsDeviceMenuOpen(false)}
          onConnectionStatusChange={handleConnectionStatusChange}
        />
      )}
      {showStreamLog && <StreamLogPanel />}
    </div>
  );
}

export default App;
