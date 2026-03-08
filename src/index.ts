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

    const rawParser = express.raw({
        type: '*/*',
        limit: '50mb',
        verify: (req: Request, res, buf) => {
            req.rawBody = buf;
        }
    });

    // For file contents and upload sessions, always parse as raw regardless of Content-Type.
    // This prevents express.json() from attempting to parse invalid JSON and crashing.
    app.use((req, res, next) => {
        if (req.path.endsWith('/content') || req.path.includes('/upload-sessions')) {
            rawParser(req, res, next);
        } else {
            next();
        }
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

    // Explicit raw body for binary uploads (catch-all for other routes if not json/text)
    app.use(rawParser);

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
        if (req.path.startsWith('/v1.0/upload-sessions')) return next();

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

    // Error handler for body-parser syntax errors
    app.use((err: any, req: Request, res: express.Response, next: express.NextFunction) => {
        if (err instanceof SyntaxError && 'status' in err && err.status === 400 && 'body' in err) {
            res.status(400).json({
                error: {
                    code: 'invalidRequest',
                    message: err.message
                }
            });
            return;
        }
        next(err);
    });

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
