import { io, Socket } from 'socket.io-client';
import { useDeviceStore } from '../stores/deviceStore';
import { useSimStore, SimSession } from '../stores/simStore';
import { usePGNStore } from '../stores/pgnStore';
import { useEmitterStore } from '../stores/emitterStore';

let socket: Socket | null = null;

// Push a server session into the UI stores.
export function applySession(session: SimSession) {
    useSimStore.getState().setSession(session);
    usePGNStore.getState().applySessionPGNs(session.pgns);
    useEmitterStore.getState().setPGNsToStream(
        Object.entries(session.pgns).filter(([, cfg]) => cfg.stream).map(([pgn]) => pgn)
    );
    useEmitterStore.getState().setIsEmitting(session.running);
}

export const initSocket = (): Socket => {
    if (!socket) {
        // Unset in the container build: the UI is served by the backend, so
        // connect to the page's own origin. Set it for split dev servers.
        const backendUrl = process.env.REACT_APP_BACKEND_URL || window.location.origin;
        socket = io(backendUrl, {
            transports: ['websocket'],
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            // Keep trying: the simulation runs on the server, the UI just reconnects.
            reconnectionAttempts: Infinity,
            forceNew: true,
            timeout: 5000,
            // Disable buffering/batching
            perMessageDeflate: { threshold: 0 },
            // Enable TCP_NODELAY
            extraHeaders: {
                'Connection': 'Upgrade',
                'Upgrade': 'websocket',
                'TCP_NODELAY': '1'
            },
            // Add performance configurations
            transportOptions: {
                websocket: {
                    binaryType: 'arraybuffer',
                    noDelay: true  // Enable TCP_NODELAY for WebSocket
                }
            }
        });

        // Add connection monitoring
        socket.on('connect', () => {
            console.log('Socket connected with ID:', socket?.id);
            // Try to set TCP_NODELAY on the underlying connection if possible
            const transport = (socket as any).io?.engine?.transport;
            if (transport?.ws?.socket?.setNoDelay) {
                transport.ws.socket.setNoDelay(true);
                console.log('Set TCP_NODELAY on client WebSocket');
            }
        });

        socket.on('device_error', (error) => {
            console.log("Device error received:", error);
            // Extract the error message from the complex error object
            const errorMessage = typeof error === 'object' 
                ? (error.error || error.message || JSON.stringify(error))
                : String(error);
            useDeviceStore.getState().setError(errorMessage);
        });

        socket.on('disconnect', (reason) => {
            console.log('Socket disconnected:', reason);
            useSimStore.getState().setConnected(false);
        });

        socket.on('connect', () => useSimStore.getState().setConnected(true));

        // Server-side simulation session and live state.
        socket.on('sim_session', (session: SimSession) => applySession(session));

        socket.on('sim_tick', (tick) => {
            useSimStore.getState().setTick(tick);
            if (tick.values) {
                const pgns: Record<string, { rate: number; values: Record<string, number> }> = {};
                for (const [pgn, values] of Object.entries(tick.values)) {
                    if (values) pgns[pgn] = { rate: 0, values: values as Record<string, number> };
                }
                usePGNStore.getState().applySessionPGNs(pgns);
            }
        });

        socket.on('pgn_log', (lines: string[]) => {
            useEmitterStore.getState().appendLinesToStreamLog(lines);
        });

        socket.io.on('ping', () => {
            //console.log('Socket ping');
        });

        socket.io.engine?.on('packet', (packet: any) => {
            //console.log('Socket packet:', packet);
        });
    }
    return socket;
};

export const getSocket = (): Socket | null => socket; 