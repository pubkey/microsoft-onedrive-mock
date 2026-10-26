/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestEnvironment } from './config';

const SPECIAL_CHARS = [
    '%', '%41', '#', '?', '&', '+', ':', '*', '\\', ' ',
    '.', ',', '~', '-', '_', '\'', '[', ']', '{', '}', 'ä', '😊'
];

describe('OneDrive URL Encoding of File Names', () => {
    let env: Awaited<ReturnType<typeof setupTestEnvironment>>;
    let baseUrl: string;
    let headers: Record<string, string>;

    beforeAll(async () => {
        env = await setupTestEnvironment();
        baseUrl = env.baseUrl;
        headers = { 'Authorization': `Bearer ${env.token}`, 'Content-Type': 'application/json' };
    });

    afterAll(async () => {
        if (env) env.close();
    });

    beforeEach(async () => {
        await env.clear();
    });

    const createFolder = async () => {
        const res = await fetch(`${baseUrl}/v1.0/me/drive/items/root/children`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                name: 'EncodingFolder_' + Date.now(),
                folder: {},
                '@microsoft.graph.conflictBehavior': 'rename'
            })
        });
        expect(res.status).toBe(201);
        return (await res.json()).id as string;
    };

    const uploadFile = async (parentId: string, name: string) => {
        const res = await fetch(`${baseUrl}/v1.0/me/drive/items/${parentId}:/${encodeURIComponent(name)}:/content`, {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.name).toBe(name);
    };

    for (const char of SPECIAL_CHARS) {
        const name = `a${char}b.json`;

        it(`should read back a file named ${JSON.stringify(name)} by path`, async () => {
            const parentId = await createFolder();
            await uploadFile(parentId, name);

            const res = await fetch(`${baseUrl}/v1.0/me/drive/items/${parentId}:/${encodeURIComponent(name)}`, { headers });
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.name).toBe(name);
        });

        it(`should read back a file named ${JSON.stringify(name)} by path inside a $batch`, async () => {
            const parentId = await createFolder();
            await uploadFile(parentId, name);

            const res = await fetch(`${baseUrl}/v1.0/$batch`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    requests: [{
                        id: '1',
                        method: 'GET',
                        url: `/me/drive/items/${parentId}:/${encodeURIComponent(name)}`
                    }]
                })
            });
            expect(res.status).toBe(200);
            const data = await res.json();
            const part = data.responses.find((r: any) => r.id === '1');
            expect(part.status).toBe(200);
            expect(part.body.name).toBe(name);
        });
    }
});
