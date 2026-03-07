import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestEnvironment } from './config';

describe('OneDrive Missing Endpoints (Mock Behavioral Verification)', () => {
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

    it('should return mock drives list', async () => {
        const res = await fetch(`${baseUrl}/v1.0/me/drives`, { headers });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.value).toBeInstanceOf(Array);
        expect(data.value.length).toBeGreaterThan(0);
        expect(data.value[0].name).toBeDefined();
    });

    it('should handle special folders correctly from root', async () => {
        const res = await fetch(`${baseUrl}/v1.0/me/drive/special/documents`, { headers });
        if (res.status !== 200) console.log("SPECIAL ERR:", await res.text());
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.id).toBeDefined();
    });

    it('should handle async copy on an item (HTTP 202)', async () => {
        // Create an item first
        const putRes = await fetch(`${baseUrl}/v1.0/me/drive/items/root:/test-copy.txt:/content`, {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'text/plain' },
            body: 'content'
        });
        const file = await putRes.json();

        // Copy item
        const newName = `test-copy-2-${Date.now()}.txt`;
        const copyRes = await fetch(`${baseUrl}/v1.0/me/drive/items/${file.id}/copy`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ parentReference: { id: 'root' }, name: newName })
        });
        if (copyRes.status !== 202) console.log("COPY ERR:", await copyRes.text());
        expect(copyRes.status).toBe(202);
        expect(copyRes.headers.get('Location')).toBeDefined();
    });

    it('should create an upload session and accept chunks', async () => {
        // 1. Create upload session
        const sessionRes = await fetch(`${baseUrl}/v1.0/me/drive/root:/large-file.bin:/createUploadSession`, {
            method: 'POST',
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace', name: 'large-file.bin' } })
        });
        if (sessionRes.status !== 200) console.log("SESSION ERR:", await sessionRes.text());
        expect(sessionRes.status).toBe(200);
        const session = await sessionRes.json();
        expect(session.uploadUrl).toBeDefined();

        const uploadRes = await fetch(session.uploadUrl, {
            method: 'PUT',
            headers: {
                'Content-Range': 'bytes 0-10/11',
                'Content-Type': 'application/octet-stream'
            },
            body: 'Hello World'
        });

        // Returns 201 Created (new) or 200 OK (replaced)
        expect([200, 201]).toContain(uploadRes.status);
        const file = await uploadRes.json();
        expect(file.id).toBeDefined();
        expect(file.name).toBe('large-file.bin');
    });

});
