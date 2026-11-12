import { create } from 'zustand';
import { deviceApi } from '../services/api';

interface DeviceStatus {
    status: 'connected' | 'disconnected';
    path: string;
    type: string;
    enabled?: boolean;
    detail?: string;
    error?: string | null;
}

interface DeviceStore {
    devices: Record<string, DeviceStatus>;
    error: string | null;
    isConnecting: boolean;

    setDevices: (devices: Record<string, DeviceStatus>) => void;
    setError: (error: string | null) => void;
    clearError: () => void;

    fetchDeviceStatus: () => Promise<void>;
    connectDevice: (devicePath: string) => Promise<void>;
    disconnectDevice: (devicePath: string) => Promise<void>;
}

export const useDeviceStore = create<DeviceStore>((set, get) => ({
    devices: {},
    error: null,
    isConnecting: false,

    setDevices: (devices) => set({ devices }),
    setError: (error) => set({ error }),
    clearError: () => set({ error: null }),

    fetchDeviceStatus: async () => {
        try {
            const devices = await deviceApi.getStatus();
            set({ devices });
        } catch (error) {
            console.error('Error fetching device status:', error);
            set({ error: error instanceof Error ? error.message : 'Failed to fetch device status' });
        }
    },

    connectDevice: async (devicePath) => {
        set({ isConnecting: true, error: null });
        try {
            await deviceApi.connect(devicePath);
            await get().fetchDeviceStatus();
        } catch (error) {
            set({ error: error instanceof Error ? error.message : 'Failed to connect' });
        } finally {
            set({ isConnecting: false });
        }
    },

    disconnectDevice: async (devicePath) => {
        try {
            await deviceApi.disconnect(devicePath);
            await get().fetchDeviceStatus();
        } catch (error) {
            set({ error: error instanceof Error ? error.message : 'Failed to disconnect' });
        }
    },
}));
