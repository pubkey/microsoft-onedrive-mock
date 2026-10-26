import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestEnvironment } from './config';

describe.skipIf(process.env.TEST_TARGET === 'real')('Mock URL decoding', () => {
    let env: Awaited<ReturnType<typeof setupTestEnvironment>>;
    let baseUrl: string;
    let headers: Record<string, string>;

    beforeAll(async () => {
        env = await setupTestEnvironment();
        baseUrl = env.baseUrl;
        headers = {
            Authorization: `Bearer ${env.token}`,
            'Content-Type': 'application/json'
        };
    });

    afterAll(() => {
        if (env) env.close();
    });

    beforeEach(async () => {
        await env.clear();
    });

    const characters = [
        '%', '%41', '#', '?', '&', '+', ':', '*', '\\', ' ',
        '.', ',', '~', '-', '_', "'", '[', ']', '{', '}', '\u00e4', '\u{1f60a}'
    ];

    it.each(characters)('preserves %j in direct and batch path lookups', async (character) => {
        const name = `a${character}b.json`;
        const encodedName = encodeURIComponent(name);
        const folderRes = await fetch(`${baseUrl}/v1.0/me/drive/items/root/children`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ name: 'Encoding', folder: {} })
        });
        expect(folderRes.status).toBe(201);
        const folder = await folderRes.json();

        for (const parentId of ['root', folder.id]) {
            const uploadRes = await fetch(`${baseUrl}/v1.0/me/drive/items/${parentId}:/${encodedName}:/content`, {
                method: 'PUT',
                headers,
                body: '{}'
            });
            expect(uploadRes.status).toBe(201);
            const file = await uploadRes.json();
            expect(file.name).toBe(name);

            const paths = [`/me/drive/items/${parentId}:/${encodedName}`];
            if (parentId === 'root') paths.push(`/me/drive/root:/${encodedName}`);

            for (const path of paths) {
                const lookupRes = await fetch(`${baseUrl}/v1.0${path}`, { headers });
                expect(lookupRes.status).toBe(200);
                expect(await lookupRes.json()).toMatchObject({ id: file.id, name });

                const batchRes = await fetch(`${baseUrl}/v1.0/$batch`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        requests: [
                            { id: 'relative', method: 'GET', url: path },
                            { id: 'versioned', method: 'GET', url: `/v1.0${path}` }
                        ]
                    })
                });
                expect(batchRes.status).toBe(200);
                const batch = await batchRes.json();
                expect(batch.responses).toHaveLength(2);
                for (const response of batch.responses) {
                    expect(response.status).toBe(200);
                    expect(response.body).toMatchObject({ id: file.id, name });
                }
            }
        }
    });

    it.each(['a%b.json', 'a%41b.json'])('preserves %s in upload sessions', async (name) => {
        const encodedName = encodeURIComponent(name);

        for (const path of ['/me/drive/items/root:', '/me/drive/root:']) {
            const sessionRes = await fetch(`${baseUrl}/v1.0${path}/${encodedName}:/createUploadSession`, {
                method: 'POST',
                headers,
                body: '{}'
            });
            expect(sessionRes.status).toBe(200);
            const session = await sessionRes.json();
            const uploadRes = await fetch(session.uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/octet-stream' },
                body: '{}'
            });
            expect(uploadRes.status).toBe(200);
            expect(await uploadRes.json()).toMatchObject({ name });
        }
    });

    it.each(['a%b.json', 'a%41b.json'])('preserves %s in direct and batch search', async (name) => {
        const encodedName = encodeURIComponent(name);
        const uploadRes = await fetch(`${baseUrl}/v1.0/me/drive/items/root:/${encodedName}:/content`, {
            method: 'PUT',
            headers,
            body: '{}'
        });
        expect(uploadRes.status).toBe(201);
        const searchPath = `/me/drive/root/search(q='${encodedName}')?$select=name`;
        const searchRes = await fetch(`${baseUrl}/v1.0${searchPath}`, { headers });
        expect(searchRes.status).toBe(200);
        const expected = { value: [{ name }] };
        expect(await searchRes.json()).toEqual(expected);

        const batchRes = await fetch(`${baseUrl}/v1.0/$batch`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ requests: [{ id: 'search', method: 'GET', url: searchPath }] })
        });
        expect(batchRes.status).toBe(200);
        const batch = await batchRes.json();
        expect(batch.responses[0].status).toBe(200);
        expect(batch.responses[0].body).toEqual(expected);
    });
});
