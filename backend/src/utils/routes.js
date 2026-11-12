import { saveDefaults, getDefaults, saveWaypoints, getWaypoints } from './storage.js';

export function configureRoutes(app, forwarder) {
    // Logging middleware
    app.use((req, res, next) => {
        console.log(`Incoming ${req.method} request for ${req.url}`);
        next();
    });

    // Defaults routes
    app.post('/api/defaults', async (req, res) => {
        try {
            const defaults = await saveDefaults(req.body);
            res.json(defaults);
        } catch (error) {
            console.error('Error saving defaults:', error);
            res.status(500).json({ error: 'Failed to save defaults' });
        }
    });

    app.get('/api/defaults', async (req, res) => {
        try {
            const defaults = await getDefaults();
            res.json(defaults);
        } catch (error) {
            console.error('Error reading defaults:', error);
            res.status(500).json({ error: 'Failed to read defaults' });
        }
    });

    // Waypoints routes
    app.post('/api/waypoints', async (req, res) => {
        try {
            const waypoints = await saveWaypoints(req.body);
            res.json(waypoints);
        } catch (error) {
            console.error('Error saving waypoints:', error);
            res.status(500).json({ error: 'Failed to save waypoints' });
        }
    });

    app.get('/api/waypoints', async (req, res) => {
        try {
            const waypoints = await getWaypoints();
            res.json(waypoints);
        } catch (error) {
            console.error('Error reading waypoints:', error);
            res.status(500).json({ error: 'Failed to read waypoints' });
        }
    });

    // Device management routes
    // "Devices" are the two outputs: the Signal K feed and the bus injector link.
    // connect/disconnect take { devicePath } from the status keys.
    app.get('/api/device/status', (req, res) => {
        res.json(forwarder.getEachDeviceStatus());
    });

    app.post('/api/device/connect', (req, res) => {
        try {
            forwarder.connectDevice(req.body.devicePath);
            return res.json({ message: 'Connection initiated' });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    });

    app.post('/api/device/disconnect', (req, res) => {
        try {
            forwarder.disconnectDevice(req.body.devicePath);
            res.json({ message: 'Disconnection initiated' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
} 