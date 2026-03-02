export interface AppConfig {
    apiEndpoint?: string;
    serverLagBefore?: number;
    serverLagAfter?: number;
}

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            rawBody?: Buffer | string;
        }
    }
}

// Basic representation of a Microsoft Graph DriveItem
export interface DriveItem {
    id: string;
    name: string;
    eTag: string;
    cTag: string;
    createdBy?: { user: { displayName: string } };
    lastModifiedBy?: { user: { displayName: string } };
    createdDateTime: string;
    lastModifiedDateTime: string;
    size: number;
    parentReference?: {
        driveId?: string;
        driveType?: string;
        id?: string;
        path?: string;
    };
    file?: {
        mimeType: string;
        hashes?: {
            quickXorHash?: string;
            sha1Hash?: string;
            sha256Hash?: string;
        };
    };
    folder?: {
        childCount: number;
    };
    deleted?: {
        state: string;
    };
    '@microsoft.graph.downloadUrl'?: string;

    // Internal usage for mock state
    content?: unknown;
    [key: string]: unknown;
}

export interface DeltaResponse {
    '@odata.context': string;
    '@odata.nextLink'?: string;
    '@odata.deltaLink'?: string;
    value: DriveItem[];
}
