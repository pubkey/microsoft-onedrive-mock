/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestEnvironment } from './config';

describe('OneDrive Basics', () => {
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

    it('should get drive root', async () => {
        const res = await fetch(`${baseUrl}/v1.0/me/drive/root`, { headers });
        if (res.status !== 200) console.log("ROOT ERROR:", await res.text());
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.id).toBeDefined();
        expect(data.name).toBe('root');
    });

    it('should create a new folder and verify it appears in children', async () => {
        const folderName = 'TestFolder_' + Date.now();
        const folderRes = await fetch(`${baseUrl}/v1.0/me/drive/items/root/children`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                name: folderName,
                folder: {},
                '@microsoft.graph.conflictBehavior': 'rename'
            })
        });

        if (folderRes.status !== 201) console.log("FOLDER ERROR:", await folderRes.text());
        expect(folderRes.status).toBe(201);
        const folderData = await folderRes.json();
        expect(folderData.name).toBe(folderName);
        expect(folderData.id).toBeDefined();

        // Verify it exists by fetching directly
        const verifyRes = await fetch(`${baseUrl}/v1.0/me/drive/items/${folderData.id}`, { headers });
        expect(verifyRes.status).toBe(200);
        const verifyData = await verifyRes.json();
        expect(verifyData.id).toBe(folderData.id);
    });

    it('should upload a new file via PUT and download it via GET', async () => {
        const filename = 'test-file-' + Date.now() + '.txt';
        const content = 'Hello World One Drive!';

        const putRes = await fetch(`${baseUrl}/v1.0/me/drive/items/root:/${filename}:/content`, {
            method: 'PUT',
            headers: {
                ...headers,
                'Content-Type': 'text/plain'
            },
            body: content
        });

        if (putRes.status !== 201) console.log("PUT ERROR:", await putRes.text());
        expect(putRes.status).toBe(201); // 201 Created for new file
        const fileData = await putRes.json();
        expect(fileData.id).toBeDefined();
        expect(fileData.name).toBe(filename);

        // Upload again to same path should update (200 OK)
        const putRes2 = await fetch(`${baseUrl}/v1.0/me/drive/items/root:/${filename}:/content`, {
            method: 'PUT',
            headers: {
                ...headers,
                'Content-Type': 'text/plain'
            },
            body: 'Updated Content'
        });
        expect(putRes2.status).toBe(200);

        // Download content via item id
        const dlRes = await fetch(`${baseUrl}/v1.0/me/drive/items/${fileData.id}/content`, { headers });
        expect(dlRes.status).toBe(200);
        const dlText = await dlRes.text();
        expect(dlText).toBe('Updated Content');
    });

    it('should handle delta queries', async () => {
        const res1 = await fetch(`${baseUrl}/v1.0/me/drive/root/delta?token=latest`, { headers });
        const delta1 = await res1.json();
        expect(delta1.value).toBeDefined();
        expect(delta1['@odata.deltaLink']).toBeDefined();

        const deltaFilename = 'delta-file-' + Date.now() + '.txt';

        // Create a file
        await fetch(`${baseUrl}/v1.0/me/drive/items/root:/${deltaFilename}:/content`, {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'text/plain' },
            body: 'delta'
        });

        const tokenUrl = delta1['@odata.deltaLink'];

        const res2 = await fetch(tokenUrl, { headers });
        const delta2 = await res2.json();
        expect(delta2.value.length).toBeGreaterThan(0);
        expect(delta2.value.find((i: any) => i.name === deltaFilename)).toBeDefined();
    });
});
