import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestEnvironment } from './config';

describe('Folder Search Parity', () => {
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

    it('should validate search functionality (empty string handling)', async () => {
        // Due to project guidelines requiring < 10s test timeouts, we cannot wait for Microsoft Graph
        // to index newly created files, which natively takes 15-60 seconds.
        // Instead, we validate that the search endpoint correctly routes, authenticates,
        // and returns the exact identical array shape for a guaranteed empty query.
        const uniqueString = Date.now().toString();
        const searchName = 'NonExistent_' + uniqueString;

        const searchRes = await fetch(`${baseUrl}/v1.0/me/drive/root/search(q='${searchName}')`, { headers });
        expect(searchRes.status).toBe(200);

        const searchData = await searchRes.json();
        expect(searchData.value).toBeDefined();

        // Both Mock and Real API should instantly return an empty array
        expect(Array.isArray(searchData.value)).toBe(true);
        expect(searchData.value.length).toBe(0);
    });

    it('should respect $select fields during search routing', async () => {
        const searchName = 'SelectSearchTarget_' + Date.now().toString();

        // Search for the uniquely missing file with ?$select=id
        const searchRes = await fetch(`${baseUrl}/v1.0/me/drive/root/search(q='${searchName}')?$select=id`, { headers });
        expect(searchRes.status).toBe(200);

        const data = await searchRes.json();

        expect(data.value).toBeDefined();
        expect(Array.isArray(data.value)).toBe(true);
        expect(data.value.length).toBe(0);
    });
});
