// Note: We avoid static imports of node-only modules to support browser mode.
// Types are fine.

export const getAuthToken = () => {
    if (typeof process !== 'undefined' && process.env.TEST_TARGET === 'real') {
        const token = process.env.ONEDRIVE_TOKEN || process.env.GRAPH_TOKEN;
        if (!token) throw new Error("Real API test requires ONEDRIVE_TOKEN or GRAPH_TOKEN in env");
        return token;
    }
    return 'valid-token';
};

export const setupTestEnvironment = async () => {
    const isBrowser = typeof window !== 'undefined';
    const isReal = typeof process !== 'undefined' && process.env.TEST_TARGET === 'real';

    if (isReal) {
        console.log("Running tests against REAL Microsoft Graph API");
        return {
            baseUrl: 'https://graph.microsoft.com',
            token: getAuthToken(),
            close: () => { },
            clear: async () => { } // Real API clear not implemented
        };
    }

    if (isBrowser) {
        console.log("Running tests against MOCK Server (Browser)");
        const serverUrl = 'http://localhost:3006';
        return {
            baseUrl: serverUrl,
            token: 'valid-token',
            close: () => { },
            clear: async () => {
                await fetch(`${serverUrl}/debug/clear`, { method: 'POST' });
            }
        };
    } else {
        console.log("Running tests against MOCK Server (Node)");
        const { startServer } = await import('../src/index');
        const { driveStore } = await import('../src/store');

        const server = startServer(0, 'localhost', { serverLagBefore: 5, serverLagAfter: 5 });

        await new Promise<void>((resolve) => {
            if (server.listening) return resolve();
            server.on('listening', resolve);
        });

        const addr = server.address();
        const port = typeof addr === 'object' && addr && 'port' in addr ? addr.port : 0;
        const baseUrl = `http://localhost:${port}`;

        return {
            baseUrl,
            token: 'valid-token',
            close: () => server.close(),
            clear: async () => {
                driveStore.clear();
            }
        };
    }
};
