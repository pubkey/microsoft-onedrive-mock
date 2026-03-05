
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestEnvironment } from './config';

describe('OData Features on Children Endpoint', () => {
    let env: Awaited<ReturnType<typeof setupTestEnvironment>>;
    let baseUrl: string;
    let token: string;
    let headers: Record<string, string>;
    let testFolderId: string;

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

        // Create a parent test folder
        const folderRes = await fetch(`${baseUrl}/v1.0/me/drive/items/root/children`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ name: 'ODataTestFolder', folder: {}, '@microsoft.graph.conflictBehavior': 'rename' })
        });
        const folderData = await folderRes.json();
        testFolderId = folderData.id;

        // Create 3 files with explicit delays to ensure different lastModifiedDateTime values
        for (let i = 1; i <= 3; i++) {
            await fetch(`${baseUrl}/v1.0/me/drive/items/${testFolderId}:/file${i}.txt:/content`, {
                method: 'PUT',
                headers: { ...headers, 'Content-Type': 'text/plain' },
                body: `Content for file ${i}`
            });
            // Brief sleep to guarantee distinct timestamps
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
    });

    it('should support $orderby descending and ascending', async () => {
        const descRes = await fetch(`${baseUrl}/v1.0/me/drive/items/${testFolderId}/children?$orderby=lastModifiedDateTime desc`, { headers });
        const descData = await descRes.json();
        expect(descData.value.length).toBe(3);
        expect(descData.value[0].name).toBe('file3.txt'); // Newest
        expect(descData.value[2].name).toBe('file1.txt'); // Oldest

        const ascRes = await fetch(`${baseUrl}/v1.0/me/drive/items/${testFolderId}/children?$orderby=lastModifiedDateTime asc`, { headers });
        const ascData = await ascRes.json();
        expect(ascData.value[0].name).toBe('file1.txt');
        expect(ascData.value[2].name).toBe('file3.txt');
    });

    it('should support $top for pagination', async () => {
        // Fetch top 2, sorted asc (file1, file2)
        const topRes = await fetch(`${baseUrl}/v1.0/me/drive/items/${testFolderId}/children?$orderby=lastModifiedDateTime asc&$top=2`, { headers });
        const topData = await topRes.json();
        expect(topData.value.length).toBe(2);
        expect(topData.value[0].name).toBe('file1.txt');
        expect(topData.value[1].name).toBe('file2.txt');
    });

    it('should support $skipToken and @odata.nextLink for pagination', async () => {
        // Fetch top 2, sorted asc (file1, file2)
        const topRes = await fetch(`${baseUrl}/v1.0/me/drive/items/${testFolderId}/children?$orderby=lastModifiedDateTime asc&$top=2`, { headers });
        const topData = await topRes.json();
        expect(topData.value.length).toBe(2);
        expect(topData['@odata.nextLink']).toBeDefined();

        // Fetch next page via nextLink
        const nextRes = await fetch(topData['@odata.nextLink'], { headers });
        const nextData = await nextRes.json();
        expect(nextData.value).toBeDefined();
        // The remaining 1 file (file3)
        expect(nextData.value.length).toBe(1);
        expect(nextData.value[0].name).toBe('file3.txt');
        expect(nextData['@odata.nextLink']).toBeUndefined();
    });

    it('should throw invalidRequest when using $skip', async () => {
        // Real Microsoft Graph does not support $skip on /children, it only uses @odata.nextLink skipTokens.
        // It returns HTTP 400 Bad Request with code 'invalidRequest'
        const skipRes = await fetch(`${baseUrl}/v1.0/me/drive/items/${testFolderId}/children?$skip=1`, { headers });
        const skipData = await skipRes.json();

        expect(skipRes.status).toBe(400);
        expect(skipData.error).toBeDefined();
        expect(skipData.error.code).toBe('invalidRequest');
        expect(skipData.error.message).toContain('$skip is not supported');
    });

    it('should throw invalidRequest when using $filter', async () => {
        const timeFile2 = '2026-03-05T00:00:00Z';
        const filterStr = `lastModifiedDateTime ge ${timeFile2}`;
        const filterRes = await fetch(`${baseUrl}/v1.0/me/drive/items/${testFolderId}/children?$filter=${encodeURIComponent(filterStr)}`, { headers });
        const filterData = await filterRes.json();

        expect(filterRes.status).toBe(400);
        expect(filterData.error).toBeDefined();
        expect(filterData.error.code).toBe('invalidRequest');
        // The error message from real API is "Invalid request"
    });

    it('should throw invalidRequest when using $count', async () => {
        const countRes = await fetch(`${baseUrl}/v1.0/me/drive/items/${testFolderId}/children?$count=true`, { headers });
        const countData = await countRes.json();

        expect(countRes.status).toBe(400);
        expect(countData.error).toBeDefined();
        expect(countData.error.code).toBe('invalidRequest');
        expect(countData.error.message).toContain('$count is not supported');
    });
});
