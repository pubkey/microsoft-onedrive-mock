import express, { Request, Response } from 'express';
import { driveStore } from '../store';

export const createV1Router = () => {
    const app = express.Router();

    // GET /me/drive/root
    app.get('/v1.0/me/drive/root', (req: Request, res: Response) => {
        const root = driveStore.getItem('root');
        if (!root) return res.status(404).json({ error: { message: "Root not found" } });
        res.json(root);
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
        res.json(item);
    });

    // GET /me/drive/items/{id}/children
    app.get('/v1.0/me/drive/items/:itemId/children', (req: Request, res: Response) => {
        const itemId = req.params.itemId as string;
        const children = driveStore.listItems(itemId);
        res.json({ value: children });
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

        res.status(201).json(newItem);
    });

    // DELETE /me/drive/items/{id}
    app.delete('/v1.0/me/drive/items/:itemId', (req: Request, res: Response) => {
        const fileId = req.params.itemId as string;
        if (fileId === 'root') {
            res.status(400).json({ error: { message: "Cannot delete root" } });
            return;
        }

        const deleted = driveStore.deleteItem(fileId);
        if (!deleted) {
            res.status(404).json({ error: { code: "itemNotFound", message: "Item not found" } });
            return;
        }
        res.status(204).send();
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
            // Update
            item = driveStore.updateItem(item.id, { content, file: { mimeType } })!;
        } else {
            // Create
            item = driveStore.createItem({
                name: filename,
                parentReference: { id: parentId },
                content,
                file: { mimeType }
            });
        }

        res.status(isNew ? 201 : 200).json(item);
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

    return app;
};
