/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestEnvironment } from './config';

describe('Field Selection Parity ($select)', () => {
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

    it('should return only requested fields using $select on item get', async () => {
        // 1. Get root, but only strictly its name and id (filtering out size, folder, parentReference, etc)
        const res = await fetch(`${baseUrl}/v1.0/me/drive/root?$select=id,name`, { headers });
        expect(res.status).toBe(200);

        const data = await res.json();

        // Ensure id and name are there
        expect(data.id).toBeDefined();
        expect(data.name).toBe('root');

        // Ensure nothing else got leaked
        // Ensure nothing else got leaked
        // NOTE: Graph API might occasionally append OData annotations implicitly like @odata.context. 
        // We will assert the base structure without extra root keys like size or folder.
        expect(data.size).toBeUndefined();
        expect(data.folder).toBeUndefined();
        expect(data.parentReference).toBeUndefined();
        expect(data.fileSystemInfo).toBeUndefined();
    });

    it('should return only requested fields in list arrays', async () => {
        // Create a subfolder to exist in children
        const folderName = 'SelectTestFolder_' + Date.now();
        await fetch(`${baseUrl}/v1.0/me/drive/items/root/children`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ name: folderName, folder: {} })
        });

        // 2. Get children with $select bounds
        const res = await fetch(`${baseUrl}/v1.0/me/drive/items/root/children?$select=id,name`, { headers });
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.value).toBeDefined();
        expect(data.value.length).toBeGreaterThan(0);

        const testFolder = data.value.find((i: any) => i.name === folderName);
        expect(testFolder).toBeDefined();

        // Deeply check that testFolder inside the array respect limits
        expect(testFolder.id).toBeDefined();
        expect(testFolder.size).toBeUndefined();
        expect(testFolder.folder).toBeUndefined();
    });
});
