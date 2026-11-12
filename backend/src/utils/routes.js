import { saveDefaults, getDefaults, saveWaypoints, getWaypoints } from './storage.js';
import { listScenarios, getScenario, saveScenario, deleteScenario } from '../sim/scenario_store.js';

// Wrap async handlers: errors become 400 { error } (bad input) or 500.
const handle = (fn) => async (req, res) => {
    try {
        const result = await fn(req, res);
        if (!res.headersSent) res.json(result ?? { ok: true });
    } catch (error) {
        console.error(`${req.method} ${req.url}:`, error.message);
        res.status(error.status || 500).json({ error: error.message });
    }
};

function notFound(message) {
    const err = new Error(message);
    err.status = 404;
    return err;
}

export function configureRoutes(app, forwarder, runner) {
    //// Scenarios (saved simulations) ////
    app.get('/api/scenarios', handle(() => listScenarios()));

    app.get('/api/scenarios/:id', handle(async (req) => {
        const scenario = await getScenario(req.params.id);
        if (!scenario) throw notFound('Scenario not found');
        return scenario;
    }));

    // Create (POST) or replace (PUT) a scenario definition.
    app.post('/api/scenarios', handle((req) => saveScenario({ ...req.body, id: undefined })));
    app.put('/api/scenarios/:id', handle(async (req) => {
        if (!(await getScenario(req.params.id))) throw notFound('Scenario not found');
        const saved = await saveScenario({ ...req.body, id: req.params.id });
        if (runner.scenario?.id === saved.id && !runner.running) await runner.load(saved.id);
        return saved;
    }));

    app.delete('/api/scenarios/:id', handle(async (req) => {
        if (runner.scenario?.id === req.params.id) {
            const err = new Error('Load another scenario before deleting this one');
            err.status = 400;
            throw err;
        }
        await deleteScenario(req.params.id);
    }));

    //// Simulation session ////
    app.get('/api/sim', handle(() => runner.snapshot()));
    app.post('/api/sim/load', handle(async (req) => {
        await runner.load(req.body.scenarioId);
        return runner.snapshot();
    }));
    app.post('/api/sim/start', handle(() => { runner.start(); return runner.snapshot(); }));
    app.post('/api/sim/stop', handle(() => { runner.stop(); return runner.snapshot(); }));
    app.post('/api/sim/reset', handle(() => { runner.reset(); return runner.snapshot(); }));
    // Save live edits into the loaded scenario, or as a new one when { name } is given.
    app.post('/api/sim/save', handle((req) => runner.save({ name: req.body?.name })));

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