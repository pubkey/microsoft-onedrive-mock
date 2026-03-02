/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestEnvironment } from './config';

describe('OneDrive Batch Requests', () => {
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

    it('should execute a batch of requests', async () => {
        const batchPayload = {
            requests: [
                {
                    id: "1",
                    method: "GET",
                    url: "/me/drive/root"
                },
                {
                    id: "2",
                    method: "POST",
                    url: "/me/drive/items/root/children",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: {
                        name: "BatchFolder",
                        folder: {}
                    }
                }
            ]
        };

        const res = await fetch(`${baseUrl}/v1.0/$batch`, {
            method: 'POST',
            headers,
            body: JSON.stringify(batchPayload)
        });

        expect(res.status).toBe(200);
        const data = await res.json();

        expect(data.responses).toBeDefined();
        expect(Array.isArray(data.responses)).toBe(true);
        expect(data.responses.length).toBe(2);

        const res1 = data.responses.find((r: any) => r.id === "1");
        const res2 = data.responses.find((r: any) => r.id === "2");

        expect(res1.status).toBe(200);
        expect(res1.body.id).toBe('root');

        expect(res2.status).toBe(201);
        expect(res2.body.name).toBe('BatchFolder');
        expect(res2.body.folder).toBeDefined();
    });
});
