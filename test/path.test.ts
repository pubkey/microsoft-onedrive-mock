import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestEnvironment } from './config';

describe('OneDrive Path-Based Addressing', () => {
    let env: Awaited<ReturnType<typeof setupTestEnvironment>>;
    let baseUrl: string;
    let token: string;
    let headers: Record<string, string>;

    beforeAll(async () => {
        env = await setupTestEnvironment();
        baseUrl = env.baseUrl;
        token = env.token;
        headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    });

    afterAll(async () => {
        if (env) env.close();
    });

    beforeEach(async () => {
        await env.clear();
    });

    it('should find an item by path', async () => {
        const folderName = 'PathTestFolder_' + Date.now();
        const filename = 'test-file-' + Date.now() + '.txt';
        const content = 'Hello Data';

        // 1. Create a folder
        const folderRes = await fetch(`${baseUrl}/v1.0/me/drive/items/root/children`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                name: folderName,
                folder: {},
                '@microsoft.graph.conflictBehavior': 'rename'
            })
        });
        expect(folderRes.status).toBe(201);
        const folderData = await folderRes.json();
        const folderId = folderData.id;

        // 2. Upload a file into the folder
        const putRes = await fetch(`${baseUrl}/v1.0/me/drive/items/${folderId}:/${filename}:/content`, {
            method: 'PUT',
            headers: {
                ...headers,
                'Content-Type': 'text/plain'
            },
            body: content
        });
        expect(putRes.status).toBe(201);
        const fileData = await putRes.json();

        // 3. Look up the file by path
        const lookupRes = await fetch(`${baseUrl}/v1.0/me/drive/items/${folderId}:/${filename}`, {
            headers
        });
        expect(lookupRes.status).toBe(200);
        const lookupData = await lookupRes.json();

        expect(lookupData.id).toBe(fileData.id);
        expect(lookupData.name).toBe(filename);
    });

    it('should return 404 for non-existent item by path', async () => {
        const folderName = 'PathTestFolder404_' + Date.now();

        // 1. Create a folder
        const folderRes = await fetch(`${baseUrl}/v1.0/me/drive/items/root/children`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                name: folderName,
                folder: {},
                '@microsoft.graph.conflictBehavior': 'rename'
            })
        });
        expect(folderRes.status).toBe(201);
        const folderData = await folderRes.json();
        const folderId = folderData.id;

        // 2. Look up a non-existent file by path
        const lookupRes = await fetch(`${baseUrl}/v1.0/me/drive/items/${folderId}:/does-not-exist.txt`, {
            headers
        });
        expect(lookupRes.status).toBe(404);
        const lookupData = await lookupRes.json();
        expect(lookupData.error).toBeDefined();
        // Microsoft Graph returns 'itemNotFound' for this
        expect(lookupData.error.code).toBe('itemNotFound');
    });
});
