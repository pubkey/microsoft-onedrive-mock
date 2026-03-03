import express, { Request } from 'express';
import cors from 'cors';
import { driveStore } from './store';
import { createV1Router } from './routes/v1';
import { handleBatchRequest } from './batch';
import { AppConfig } from './types';

export * from './types';

const createApp = (config: AppConfig = {}) => {
    if (!config.apiEndpoint) {
        config.apiEndpoint = "";
    }

    const app = express();
    app.use(cors({
        // For downloads Microsoft uses specific headers sometimes, expose ETag
        exposedHeaders: ['ETag', 'Date', 'Content-Length', 'Location']
    }));
    app.set('etag', false);

    // Latency simulator
    app.use(async (req, res, next) => {
        const delay = Math.floor(Math.random() * 21);
        if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        next();
    });

    app.use(express.json({
        verify: (req: Request, res, buf) => {
            req.rawBody = buf;
        }
    }));
    app.use(express.text({
        type: ['multipart/mixed', 'multipart/related', 'text/*', 'application/xml', 'application/octet-stream'],
        verify: (req: Request, res, buf) => {
            req.rawBody = buf;
        }
    }));

    // Explicit raw body for binary uploads
    app.use(express.raw({
        type: '*/*',
        limit: '50mb',
        verify: (req: Request, res, buf) => {
            req.rawBody = buf;
        }
    }));

    // Batch Route
    app.post('/v1.0/$batch', handleBatchRequest);

    // Debug
    app.post('/debug/clear', (req, res) => {
        driveStore.clear();
        res.status(200).send('Cleared');
    });

    // Health Check
    app.get('/', (req, res) => {
        res.status(200).send('OK');
    });

    // Auth Middleware
    const validTokens = ['valid-token', 'another-valid-token'];
    app.use((req, res, next) => {
        const authHeaderVal = req.headers.authorization;
        const authHeader = Array.isArray(authHeaderVal) ? authHeaderVal[0] : authHeaderVal;

        if (!authHeader) {
            res.status(401).json({ error: { code: "unauthenticated", message: "Unauthorized: No token provided" } });
            return;
        }

        const token = authHeader.split(' ')[1];
        if (!validTokens.includes(token)) {
            res.status(401).json({ error: { code: "unauthenticated", message: "Unauthorized: Invalid token" } });
            return;
        }
        next();
    });

    app.use(createV1Router());

    return app;
};

const startServer = (port: number, host: string = 'localhost', config: AppConfig = {}) => {
    const app = createApp(config);
    return app.listen(port, host, () => {
        console.log(`Server is running on http://${host}:${port}`);
    });
};

if (require.main === module) {
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3006;
    startServer(port);
}

export { createApp, startServer, driveStore };
