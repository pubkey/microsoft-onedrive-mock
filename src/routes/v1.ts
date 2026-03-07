import express, { Request, Response } from 'express';
import { driveStore } from '../store';

export const createV1Router = () => {
    const app = express.Router();

    // Helper to apply ?$select=id,name
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const applySelect = (item: any, selectQuery?: string | string[] | qs.ParsedQs | qs.ParsedQs[]) => {
        if (!selectQuery || typeof selectQuery !== 'string') return item;
        const fields = selectQuery.split(',').map(f => f.trim());
        if (fields.length === 0) return item;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = {};
        for (const field of fields) {
            if (item[field] !== undefined) {
                result[field] = item[field];
            }
        }
        return result;
    };

    // GET /me/drive/root
    app.get('/v1.0/me/drive/root', (req: Request, res: Response) => {
        const root = driveStore.getItem('root');
        if (!root) return res.status(404).json({ error: { message: "Root not found" } });
        res.json(applySelect(root, req.query.$select as string));
    });

    // GET /me/drive/items/{id}
    app.get('/v1.0/me/drive/items/:itemId', (req: Request, res: Response) => {
        let itemId = req.params.itemId as string;
        if (itemId === 'root') itemId = 'root'; // Already handled if just mapping

        const item = driveStore.getItem(itemId);
        if (!item) {
            res.status(404).json({ error: { code: "itemNotFound", message: "Item not found" } });
            return;
        }
        res.json(applySelect(item, req.query.$select as string));
    });

    // GET /me/drive/items/{id}/children
    app.get('/v1.0/me/drive/items/:itemId/children', (req: Request, res: Response) => {
        const itemId = req.params.itemId as string;
        let children = driveStore.listItems(itemId);

        // Basic OData $filter support for lastModifiedDateTime (RxDB sync)
        if (req.query.$filter && typeof req.query.$filter === 'string') {
            const filterStr = req.query.$filter;
            // Support formats like: lastModifiedDateTime ge '2026-03-07T16:41:28.611Z'
            const match = filterStr.match(/lastModifiedDateTime\s+(ge|gt|le|lt|eq)\s+'?([^'\s]+)'?/);
            if (match) {
                const operator = match[1];
                const dateVal = match[2];
                children = children.filter(c => {
                    const cTime = c.lastModifiedDateTime || "";
                    if (operator === 'ge') return cTime >= dateVal;
                    if (operator === 'gt') return cTime > dateVal;
                    if (operator === 'le') return cTime <= dateVal;
                    if (operator === 'lt') return cTime < dateVal;
                    if (operator === 'eq') return cTime === dateVal;
                    return true;
                });
            } else {
                // For unsupported filters, return 400 to match real API strictness
                res.status(400).json({
                    error: {
                        code: 'invalidRequest',
                        message: 'Invalid request'
                    }
                });
                return;
            }
        }

        // Basic OData $orderby support
        if (req.query.$orderby && typeof req.query.$orderby === 'string') {
            const descending = req.query.$orderby.includes('desc');
            children.sort((a, b) => {
                const timeA = a.lastModifiedDateTime || "";
                const timeB = b.lastModifiedDateTime || "";
                if (timeA === timeB) {
                    return a.name > b.name ? 1 : -1;
                }
                if (descending) return timeA < timeB ? 1 : -1;
                return timeA > timeB ? 1 : -1;
            });
        }

        // Basic OData $top support and $skip REJECTION
        let skip = 0;
        if (req.query.$skip && typeof req.query.$skip === 'string') {
            res.status(400).json({
                error: {
                    code: 'invalidRequest',
                    message: '$skip is not supported on this API. Only URLs returned by the API can be used to page.'
                }
            });
            return;
        }

        // Basic OData $top support and $skipToken pagination
        if (req.query.$skipToken && typeof req.query.$skipToken === 'string') {
            const parsedToken = parseInt(req.query.$skipToken, 10);
            if (!isNaN(parsedToken)) skip = parsedToken;
        }

        let hasMore = false;
        let nextSkipToken = 0;

        if (req.query.$top && typeof req.query.$top === 'string') {
            const top = parseInt(req.query.$top, 10);
            if (!isNaN(top)) {
                if (skip + top < children.length) {
                    hasMore = true;
                    nextSkipToken = skip + top;
                }
                children = children.slice(skip, skip + top);
            }
        } else if (skip > 0) {
            children = children.slice(skip);
        }

        const mappedChildren = children.map(c => applySelect(c, req.query.$select as string));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response: any = { value: mappedChildren };

        if (hasMore) {
            const host = req.headers.host || 'localhost';
            const protocol = req.protocol || 'http';
            const baseBaseUrl = `${protocol}://${host}`;
            const url = new URL(req.originalUrl || req.url, baseBaseUrl);
            url.searchParams.set('$skipToken', nextSkipToken.toString());
            response['@odata.nextLink'] = url.toString();
        }

        if (req.query.$count === 'true') {
            res.status(400).json({
                error: {
                    code: 'invalidRequest',
                    message: '$count is not supported on this API. Only URLs returned by the API can be used to page.'
                }
            });
            return;
        }

        res.json(response);
    });

    // GET /me/drive/root/search(q='query')
    app.get('/v1.0/me/drive/root/search\\(q=\':query\'\\)', (req: Request, res: Response) => {
        let query = (req.params.query as string) || "";
        // Decode URI component incase it's URL encoded like %20 or %27
        query = decodeURIComponent(query);
        // Strip out the trailing quote matching if it caught the literal '
        if (query.endsWith("'")) query = query.slice(0, -1);
        query = query.toLowerCase();

        // recursively find items
        const allItems = driveStore.getAllItems();
        const results = allItems.filter(item => item.name.toLowerCase().includes(query) && item.id !== 'root');

        const mappedResults = results.map(c => applySelect(c, req.query.$select as string));
        res.json({ value: mappedResults });
    });

    // POST /me/drive/items/{parent-id}/children (Create Metadata / Folder)
    app.post('/v1.0/me/drive/items/:itemId/children', (req: Request, res: Response) => {
        const parentId = req.params.itemId as string;
        const body = req.body || {};

        let parentItem = driveStore.getItem(parentId);
        if (!parentItem && parentId === 'root') {
            parentItem = driveStore.createItem({ id: 'root', name: 'root' }, true);
        } else if (!parentItem) {
            res.status(404).json({ error: { code: "itemNotFound", message: "Parent not found" } });
            return;
        }

        const isFolder = !!body.folder;
        const newItem = driveStore.createItem({
            name: body.name || "Untitled",
            parentReference: { id: parentId },
            ...body
        }, isFolder);

        res.status(201).json(applySelect(newItem, req.query.$select as string));
    });

    // DELETE /me/drive/items/{id}
    app.delete('/v1.0/me/drive/items/:itemId', (req: Request, res: Response) => {
        const fileId = req.params.itemId as string;
        if (fileId === 'root') {
            res.status(400).json({ error: { message: "Cannot delete root" } });
            return;
        }

        const item = driveStore.getItem(fileId);
        if (!item) {
            res.status(404).json({ error: { code: "itemNotFound", message: "Item not found" } });
            return;
        }

        const ifMatch = req.header('If-Match');
        if (ifMatch && ifMatch !== item.eTag) {
            res.status(409).json({ error: { code: "preconditionFailed", message: "ETag mismatch" } });
            return;
        }

        driveStore.deleteItem(fileId);
        res.status(204).send();
    });

    // PATCH /me/drive/items/{id}
    app.patch('/v1.0/me/drive/items/:itemId', (req: Request, res: Response) => {
        const fileId = req.params.itemId as string;
        if (fileId === 'root') {
            res.status(400).json({ error: { message: "Cannot modify root" } });
            return;
        }

        const item = driveStore.getItem(fileId);
        if (!item) {
            res.status(404).json({ error: { code: "itemNotFound", message: "Item not found" } });
            return;
        }

        const ifMatch = req.header('If-Match');
        if (ifMatch && ifMatch !== item.eTag) {
            res.status(409).json({ error: { code: "preconditionFailed", message: "ETag mismatch" } });
            return;
        }

        const updates = req.body;
        const updatedItem = driveStore.updateItem(fileId, updates);

        res.status(200).json(applySelect(updatedItem, req.query.$select as string));
    });

    // GET /me/drive/items/{id}/content
    app.get('/v1.0/me/drive/items/:itemId/content', (req: Request, res: Response) => {
        const fileId = req.params.itemId as string;
        const file = driveStore.getItem(fileId);

        if (!file || file.folder) {
            res.status(404).json({ error: { code: "itemNotFound", message: "File not found" } });
            return;
        }

        if (file.file?.mimeType) {
            res.setHeader('Content-Type', file.file.mimeType);
        }

        if (file.content === undefined) {
            res.send("");
            return;
        }

        if (Buffer.isBuffer(file.content)) {
            res.send(file.content);
        } else if (typeof file.content === 'object') {
            res.json(file.content);
        } else {
            res.send(file.content);
        }
    });

    // Path-based Addressing
    app.get('/v1.0/me/drive/items/:parentId\\:/:filename', (req: Request, res: Response) => {
        const params = req.params as Record<string, string>;
        const parentId = params.parentId;
        let filename = params.filename;

        if (filename.endsWith(':')) filename = filename.slice(0, -1);
        filename = decodeURIComponent(filename);

        const parentObj = driveStore.getItem(parentId) || (parentId === 'root' ? driveStore.getItem('root') : null);
        if (!parentObj) {
            return res.status(404).json({ error: { code: "itemNotFound", message: "Parent not found" } });
        }

        const child = driveStore.getItemByName(parentId, filename);
        if (!child) {
            return res.status(404).json({ error: { code: "itemNotFound", message: "Item not found" } });
        }

        res.status(200).json(applySelect(child, req.query.$select as string));
    });

    app.get('/v1.0/me/drive/root\\:/:filename', (req: Request, res: Response) => {
        const params = req.params as Record<string, string>;
        let filename = params.filename;

        if (filename.endsWith(':')) filename = filename.slice(0, -1);
        filename = decodeURIComponent(filename);

        const child = driveStore.getItemByName('root', filename);
        if (!child) {
            return res.status(404).json({ error: { code: "itemNotFound", message: "Item not found" } });
        }

        res.status(200).json(applySelect(child, req.query.$select as string));
    });

    // PUT /me/drive/items/{parent-id}:/{filename}:/content
    app.put('/v1.0/me/drive/items/:parentId\\:/:filename\\:/content', (req: Request, res: Response) => {
        const parentId = req.params.parentId as string;
        const filename = req.params.filename as string;

        // Find existing or create
        const children = driveStore.listItems(parentId);
        let item = children.find(c => c.name === filename);

        const content = req.rawBody !== undefined ? req.rawBody : req.body;
        const headerMime = req.headers['content-type'];
        const mimeType = (Array.isArray(headerMime) ? headerMime[0] : headerMime) || 'application/octet-stream';

        const isNew = !item;

        if (item) {
            const ifMatch = req.header('If-Match');
            if (ifMatch && ifMatch !== item.eTag) {
                res.status(412).json({ error: { code: "PreconditionFailed", message: "ETag mismatch" } });
                return;
            }

            // Update
            const size = content ? (Buffer.isBuffer(content) || typeof content === 'string' ? content.length : JSON.stringify(content).length) : 0;
            item = driveStore.updateItem(item.id, { content, file: { mimeType }, size })!;
        } else {
            // Create
            item = driveStore.createItem({
                name: filename,
                parentReference: { id: parentId },
                content,
                file: { mimeType },
                size: content ? (Buffer.isBuffer(content) || typeof content === 'string' ? content.length : JSON.stringify(content).length) : 0
            });
        }

        res.status(isNew ? 201 : 200).json(applySelect(item, req.query.$select as string));
    });

    // PUT /me/drive/items/{id}/content
    app.put('/v1.0/me/drive/items/:itemId/content', (req: Request, res: Response) => {
        const itemId = req.params.itemId as string;
        let item = driveStore.getItem(itemId);

        if (!item || item.folder) {
            res.status(404).json({ error: { code: "itemNotFound", message: "Item not found" } });
            return;
        }

        const ifMatch = req.header('If-Match');
        if (ifMatch && ifMatch !== item.eTag) {
            res.status(412).json({ error: { code: "PreconditionFailed", message: "ETag mismatch" } });
            return;
        }

        const content = req.rawBody !== undefined ? req.rawBody : req.body;
        const headerMime = req.headers['content-type'];
        const mimeType = (Array.isArray(headerMime) ? headerMime[0] : headerMime) || item.file?.mimeType || 'application/octet-stream';

        const size = content ? (Buffer.isBuffer(content) || typeof content === 'string' ? content.length : JSON.stringify(content).length) : 0;
        item = driveStore.updateItem(item.id, { content, file: { mimeType }, size })!;

        res.status(200).json(applySelect(item, req.query.$select as string));
    });

    // Delta Query
    // GET /me/drive/root/delta
    app.get('/v1.0/me/drive/root/delta', (req: Request, res: Response) => {
        const tokenStr = req.query.token as string;

        let token: string | undefined = undefined;
        if (tokenStr) token = tokenStr;

        const result = driveStore.getDelta(token);

        const host = req.headers.host || 'localhost';
        const protocol = req.protocol || 'http';
        const baseUrl = `${protocol}://${host}`;

        res.json({
            '@odata.context': `${baseUrl}/v1.0/$metadata#Collection(driveItem)`,
            '@odata.deltaLink': `${baseUrl}/v1.0/me/drive/root/delta?token=${result.deltaLink}`,
            value: result.items
        });
    });

    // ==========================================
    // MISSING ENDPOINTS IMPLEMENTATION
    // ==========================================

    // --- Drives & Shared Content ---
    const defaultDrive = {
        id: "b!default-mock-drive-id",
        driveType: "personal",
        name: "OneDrive",
        owner: { user: { id: "user1", displayName: "Mock User" } }
    };

    app.get('/v1.0/me/drives', (req, res) => {
        res.json({ value: [defaultDrive] });
    });

    app.get('/v1.0/drives/:driveId', (req, res) => {
        res.json(defaultDrive);
    });

    app.get('/v1.0/me/drive/sharedWithMe', (req, res) => {
        res.json({ value: [] });
    });

    app.get('/v1.0/me/drive/recent', (req, res) => {
        res.json({ value: [] });
    });

    app.get('/v1.0/me/drive/following', (req, res) => {
        res.json({ value: [] });
    });

    // --- Special Folders ---
    app.get('/v1.0/me/drive/special/:folderName', (req, res) => {
        const root = driveStore.getItem('root');
        if (!root) return res.status(404).json({ error: { message: "Not found" } });
        res.json(root);
    });

    // --- Advanced Item Operations ---
    app.post('/v1.0/me/drive/items/:itemId/copy', (req, res) => {
        const itemId = req.params.itemId;
        const item = driveStore.getItem(itemId);
        if (!item) return res.status(404).json({ error: { message: "Not found" } });

        const host = req.headers.host || 'localhost';
        const protocol = req.protocol || 'http';
        const baseUrl = `${protocol}://${host}`;

        res.setHeader('Location', `${baseUrl}/v1.0/monitor/mock-copy-job-12345`);
        res.status(202).json({});
    });

    app.post('/v1.0/me/drive/items/:itemId/createLink', (req, res) => {
        const item = driveStore.getItem(req.params.itemId);
        if (!item) return res.status(404).json({ error: { message: "Not found" } });
        res.json({
            id: "mock-link-id",
            roles: ["write"],
            link: { webUrl: "https://mock-onedrive-link/123" }
        });
    });

    app.get('/v1.0/me/drive/items/:itemId/permissions', (req, res) => {
        res.json({ value: [{ id: "perm1", roles: ["write"] }] });
    });

    app.post('/v1.0/me/drive/items/:itemId/invite', (req, res) => {
        res.json({ value: [{ id: "perm1", roles: ["write"] }] });
    });

    app.delete('/v1.0/me/drive/items/:itemId/permissions/:permId', (req, res) => {
        res.status(204).send();
    });

    app.get('/v1.0/me/drive/items/:itemId/versions', (req, res) => {
        res.json({ value: [] });
    });

    app.post('/v1.0/me/drive/items/:itemId/versions/:versionId/restoreVersion', (req, res) => {
        res.status(204).send();
    });

    app.post('/v1.0/me/drive/items/:itemId/checkout', (req, res) => {
        res.status(204).send();
    });

    app.post('/v1.0/me/drive/items/:itemId/checkin', (req, res) => {
        res.status(204).send();
    });

    app.get('/v1.0/me/drive/items/:itemId/thumbnails', (req, res) => {
        res.json({
            value: [
                { id: "0", large: { url: "https://mock-thumbnail-url/large" } }
            ]
        });
    });

    app.get('/v1.0/me/drive/items/:itemId/activities', (req, res) => {
        res.json({ value: [] });
    });

    // --- Upload Sessions ---
    const handleCreateUploadSession = (parentId: string, filename: string, req: express.Request, res: express.Response) => {
        const parentObj = driveStore.getItem(parentId) || (parentId === 'root' ? driveStore.getItem('root') : null);
        if (!parentObj) {
            return res.status(404).json({ error: { code: "itemNotFound", message: "Parent not found" } });
        }

        const session = driveStore.createUploadSession(parentId, filename);

        const host = req.headers.host || 'localhost';
        const protocol = req.protocol || 'http';
        const baseUrl = `${protocol}://${host}`;

        res.status(200).json({
            uploadUrl: `${baseUrl}/v1.0${session.uploadUrl}`,
            expirationDateTime: session.expirationDateTime
        });
    };

    app.post('/v1.0/me/drive/items/:parentId\\:/:filename\\:/createUploadSession', (req, res) => {
        const params = req.params as Record<string, string>;
        handleCreateUploadSession(params.parentId, decodeURIComponent(params.filename), req, res);
    });

    app.post('/v1.0/me/drive/root\\:/:filename\\:/createUploadSession', (req, res) => {
        const params = req.params as Record<string, string>;
        handleCreateUploadSession('root', decodeURIComponent(params.filename), req, res);
    });

    // --- Subscriptions ---
    app.post('/v1.0/subscriptions', (req, res) => {
        res.status(201).json({
            id: "mock-subscription-123",
            expirationDateTime: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString(),
            clientState: req.body.clientState || "mock-secret"
        });
    });

    app.get('/v1.0/subscriptions', (req, res) => {
        res.json({ value: [] });
    });

    app.put('/v1.0/upload-sessions/:sessionId', express.raw({ type: '*/*', limit: '50mb' }), (req, res) => {
        const sessionId = req.params.sessionId;
        const session = driveStore.getUploadSession(sessionId);
        if (!session) return res.status(404).json({ error: { message: "Session not found" } });

        const item = driveStore.completeUploadSession(sessionId);
        res.status(200).json(item);
    });

    return app;
};
