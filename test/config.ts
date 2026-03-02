import { startServer, driveStore } from '../src/index';

export const getAuthToken = () => {
    if (process.env.TEST_TARGET === 'real') {
        const token = process.env.ONEDRIVE_TOKEN || process.env.GRAPH_TOKEN;
        if (!token) throw new Error("Real API test requires ONEDRIVE_TOKEN or GRAPH_TOKEN in env");
        return token;
    }
    return 'valid-token';
};

export const setupTestEnvironment = async () => {
    if (process.env.TEST_TARGET === 'real') {
        console.log("Running tests against REAL Microsoft Graph API");
        return {
            baseUrl: 'https://graph.microsoft.com',
            token: getAuthToken(),
            close: () => { },
            clear: async () => { } // Real API clear not implemented
        };
    }

    console.log("Running tests against MOCK Server");
    const server = startServer(0, 'localhost', { serverLagBefore: 5, serverLagAfter: 5 });

    await new Promise<void>((resolve) => {
        if (server.listening) return resolve();
        server.on('listening', resolve);
    });

    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    const baseUrl = `http://localhost:${port}`;

    return {
        baseUrl,
        token: 'valid-token',
        close: () => server.close(),
        clear: async () => {
            // We can directly call driveStore.clear() since tests run in same process/worker as store
            driveStore.clear();
        }
    };
};
