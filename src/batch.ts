/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from 'express';
import { createApp } from './index';

export const handleBatchRequest = async (req: Request, res: Response) => {
    try {
        const body = req.body;
        if (!body || !Array.isArray(body.requests)) {
            res.status(400).json({ error: { message: "Invalid batch payload" } });
            return;
        }

        // We use an internal app instance without auth/latency middleware to process routes cleanly
        const internalApp = createApp({ serverLagBefore: 0, serverLagAfter: 0 });

        const batchResponses = await Promise.all(body.requests.map(async (part: any) => {
            const { id, method, url, body: partBody, headers: partHeaders } = part;

            // Reconstruct path. Graph batches often send relative urls like /me/drive/root
            // We append /v1.0/ to map to our internal routes if missing
            const requestPath = url.startsWith('/v1.0') ? url : `/v1.0${url.startsWith('/') ? '' : '/'}${url}`;

            return new Promise((resolve) => {
                const simulatedReq: any = {
                    method: method || 'GET',
                    url: requestPath,
                    headers: partHeaders || {},
                    body: partBody,
                    query: {}
                };

                // Inject auth header from primary request to pass auth middleware
                if (req.headers.authorization && !simulatedReq.headers.authorization) {
                    simulatedReq.headers.authorization = req.headers.authorization;
                }

                const simulatedRes: any = {
                    statusCode: 200,
                    headers: {},
                    charset: 'utf-8',
                    status: function (code: number) {
                        this.statusCode = code;
                        return this;
                    },
                    set: function (headerKey: string, headerValue: string) {
                        this.headers[headerKey] = headerValue;
                        return this;
                    },
                    setHeader: function (headerKey: string, headerValue: string) {
                        this.headers[headerKey] = headerValue;
                        return this;
                    },
                    json: function (data: any) {
                        this.data = data;
                        this.end();
                    },
                    send: function (data: any) {
                        // Normally this would be string/buffer, but let's just hold it
                        this.data = data;
                        this.end();
                    },
                    end: function () {
                        resolve({
                            id,
                            status: this.statusCode,
                            headers: this.headers,
                            body: this.data
                        });
                    }
                };

                // Bypass async handlers and directly feed to internal instance
                internalApp(simulatedReq as Request, simulatedRes as Response, () => {
                    // Fallback next
                    resolve({
                        id,
                        status: 404,
                        body: { error: { message: "Not found within batch router" } }
                    });
                });
            });
        }));

        res.json({
            responses: batchResponses
        });

    } catch (error: any) {
        res.status(500).json({ error: { message: "Internal server error during batch", details: error.message } });
    }
};
