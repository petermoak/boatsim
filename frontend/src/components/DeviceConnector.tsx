import React, { useEffect } from 'react';
import './DeviceConnector.css';
import { useDeviceStore } from '../stores/deviceStore';

interface DeviceConnectorProps {
  className?: string;
  onClose?: () => void;
  onConnectionStatusChange: (hasConnections: boolean) => void;
}

// The backend reports two outputs:
//  - signalk-feed: virtual gateway Signal K reads as an NMEA 2000 connection
//  - n2k-bus: injector plugin that transmits onto the physical bus via the NGX
const OUTPUT_LABELS: Record<string, string> = {
  'signalk-feed': 'Signal K data',
  'n2k-bus': 'N2K bus (NGX)'
};

function statusLabel(type: string, status: string, enabled?: boolean): { text: string; cls: string } {
  if (enabled === false) return { text: 'off', cls: 'off' };
  if (status === 'connected') return { text: 'connected', cls: 'connected' };
  return type === 'signalk-feed'
    ? { text: 'waiting', cls: 'waiting' }
    : { text: 'retrying', cls: 'disconnected' };
}

const DeviceConnector: React.FC<DeviceConnectorProps> = ({ className, onClose, onConnectionStatusChange }) => {
  const {
    devices,
    error,
    isConnecting,
    fetchDeviceStatus,
    connectDevice,
    disconnectDevice,
    clearError,
    setError
  } = useDeviceStore();

  useEffect(() => {
    fetchDeviceStatus();
    const interval = setInterval(fetchDeviceStatus, 1000);
    return () => clearInterval(interval);
  }, [fetchDeviceStatus]);

  useEffect(() => {
    return () => clearError();
  }, [clearError]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('.device-button')) {
        return;
      }
      if (!target.closest('.device-connector')) {
        onClose?.();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const outputs = Object.entries(devices);
  const anyConnected = outputs.some(([, d]) => d.status === 'connected');

  useEffect(() => {
    onConnectionStatusChange?.(anyConnected);
  }, [anyConnected, onConnectionStatusChange]);

  return (
    <div className={`device-connector device-connector-dynamic ${className || ''}`}>
      <div className="device-table-header">
        <h3>Outputs</h3>
        <div className="header-buttons">
          <button className="close-button" onClick={() => onClose?.()}>
            ×
          </button>
        </div>
      </div>

      <div className="device-table device-table-dynamic">
        {outputs.length === 0 ? (
          <div className="no-devices">Waiting for backend…</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Output</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {outputs.map(([path, output]) => {
                const label = statusLabel(output.type, output.status, output.enabled);
                return (
                  <tr key={path}>
                    <td>
                      <span className={`device-status ${label.cls}`}>{label.text}</span>
                    </td>
                    <td>
                      {OUTPUT_LABELS[output.type] || output.type}
                      {output.detail && <span className="device-detail">{output.detail}</span>}
                    </td>
                    <td>
                      {output.enabled ? (
                        <button
                          className="disconnect-button"
                          onClick={() => disconnectDevice(path)}
                          disabled={isConnecting}
                        >
                          Turn off
                        </button>
                      ) : (
                        <button
                          className="connect-button"
                          onClick={() => connectDevice(path)}
                          disabled={isConnecting}
                        >
                          Turn on
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {error && (
        <div className="error-message">
          <span>{error}</span>
          <button className="close-button" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}
    </div>
  );
};

export default DeviceConnector;
