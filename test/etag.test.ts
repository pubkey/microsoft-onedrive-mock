import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestEnvironment } from './config';

describe('ETag and Conditional Operations (If-Match)', () => {
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

    it('should support If-Match on PUT content update', async () => {
        const filename = 'etag-test-' + Date.now() + '.txt';

        // 1. Create file
        const putRes = await fetch(`${baseUrl}/v1.0/me/drive/items/root:/${filename}:/content`, {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'text/plain' },
            body: 'Initial content'
        });
        expect(putRes.status).toBe(201);
        const fileData = await putRes.json();
        const etag = fileData.eTag;
        const fileId = fileData.id;
        expect(etag).toBeDefined();

        // 2. Update with Wrong ETag
        const invalidEtag = etag.replace(/.$/, '0'); // Change last char
        const updateFail = await fetch(`${baseUrl}/v1.0/me/drive/items/${fileId}/content`, {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'text/plain', 'If-Match': invalidEtag },
            body: 'Should fail'
        });

        // Mock vs Real Parity verification
        // Graph API uses 412 (Precondition Failed) when ETags do not match
        expect(updateFail.status).toBe(412);

        // Verify content did not change
        const checkRes = await fetch(`${baseUrl}/v1.0/me/drive/items/${fileId}/content`, { headers });
        expect(await checkRes.text()).toBe('Initial content');

        // 3. Update with Correct ETag
        const updateSuccess = await fetch(`${baseUrl}/v1.0/me/drive/items/${fileId}/content`, {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'text/plain', 'If-Match': etag },
            body: 'Updated content'
        });
        expect(updateSuccess.status).toBe(200);

        // 4. Verify new ETag is different
        const newFileData = await updateSuccess.json();
        expect(newFileData.eTag).toBeDefined();
        expect(newFileData.eTag).not.toBe(etag);
    });
});
