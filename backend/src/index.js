import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import os from 'os';
import dotenv from 'dotenv';

// Local dev: pick up ~/.boatsim/.env if present. Real env vars win.
// Loaded before the other modules are imported so they see these values.
dotenv.config({ path: path.join(os.homedir(), '.boatsim', '.env') });

const { MessageForwarder } = await import('./message_forwarder.js');
const { configureSocketServer } = await import('./utils/socket_server.js');
const { configureRoutes } = await import('./utils/routes.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// One port serves the UI, REST API and Socket.IO.
const port = Number(process.env.BOATSIM_PORT || process.env.REACT_APP_BACKEND_PORT || 5010);

const signalkOptions = {
    host: process.env.SIGNALK_HOST || 'host.docker.internal',
    port: Number(process.env.SIGNALK_INJECTOR_PORT || 10112),
    enabled: process.env.SIGNALK_AUTOCONNECT !== 'false'
};

const frontendBuildDir = process.env.FRONTEND_BUILD_DIR
    || path.resolve(__dirname, '../../frontend/build');

const app = express();
const httpServer = createServer(app);

const { corsMiddleware, io } = configureSocketServer(httpServer);

app.use(corsMiddleware);
app.use(express.json());

const forwarder = new MessageForwarder(io, signalkOptions);

configureRoutes(app, forwarder);

// The Docker image packs /signalk-plugin so the Signal K container can
// `npm install http://<pi>:<port>/signalk-plugin.tgz`.
const pluginTarball = process.env.SIGNALK_PLUGIN_TARBALL || '/app/signalk-plugin.tgz';
app.get('/signalk-plugin.tgz', (req, res) => {
    if (!fs.existsSync(pluginTarball)) return res.status(404).send('Plugin tarball not built');
    res.sendFile(pluginTarball);
});

// Serve the built React app (same origin as the API, so no backend URL is needed).
if (fs.existsSync(path.join(frontendBuildDir, 'index.html'))) {
    app.use(express.static(frontendBuildDir));
    app.get(/^\/(?!api\/|socket\.io\/).*/, (req, res) => {
        res.sendFile(path.join(frontendBuildDir, 'index.html'));
    });
    console.log(`Serving frontend from ${frontendBuildDir}`);
} else {
    console.log(`No frontend build at ${frontendBuildDir}; serving API only`);
}

httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Boatsim running on port ${port}`);
    console.log(`Signal K injector target: ${signalkOptions.host}:${signalkOptions.port}`);
});

const shutdown = () => {
    forwarder.cleanup();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
