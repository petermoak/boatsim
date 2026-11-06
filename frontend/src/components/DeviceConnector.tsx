import React, { useEffect } from 'react';
import './DeviceConnector.css';
import { useDeviceStore } from '../stores/deviceStore';

interface DeviceConnectorProps {
  className?: string;
  onClose?: () => void;
  onConnectionStatusChange: (hasConnections: boolean) => void;
}

// PGNs go out through Signal K (signalk-boatsim-injector plugin), which owns the
// Actisense gateway. The backend reports that link as its single "device".
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

  const links = Object.entries(devices);
  const anyConnected = links.some(([, d]) => d.status === 'connected');

  useEffect(() => {
    onConnectionStatusChange?.(anyConnected);
  }, [anyConnected, onConnectionStatusChange]);

  return (
    <div className={`device-connector device-connector-dynamic ${className || ''}`}>
      <div className="device-table-header">
        <h3>Signal K Output</h3>
        <div className="header-buttons">
          <button className="close-button" onClick={() => onClose?.()}>
            ×
          </button>
        </div>
      </div>

      <div className="device-table device-table-dynamic">
        {links.length === 0 ? (
          <div className="no-devices">Waiting for backend…</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Target</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {links.map(([path, link]) => (
                <tr key={path}>
                  <td>
                    <span className={`device-status ${link.status}`}>
                      {link.status === 'disconnected' && link.enabled ? 'retrying' : link.status}
                    </span>
                  </td>
                  <td>{path}</td>
                  <td>
                    {link.enabled ? (
                      <button
                        className="disconnect-button"
                        onClick={() => disconnectDevice(path)}
                        disabled={isConnecting}
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        className="connect-button"
                        onClick={() => connectDevice(path)}
                        disabled={isConnecting}
                      >
                        Connect
                      </button>
                    )}
                  </td>
                </tr>
              ))}
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
