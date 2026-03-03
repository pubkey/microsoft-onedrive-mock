import * as crypto from 'crypto';
import { DriveItem } from './types';

export class DriveStore {
    private items: Map<string, DriveItem>;
    // To support delta we need a linear history of items created/updated/deleted
    private deltaHistory: DriveItem[];

    constructor() {
        this.items = new Map();
        this.deltaHistory = [];
    }

    private calculateStats(content: unknown): { size: number, sha1Hash: string } {
        let buffer: Buffer;
        if (typeof content === 'string') {
            buffer = Buffer.from(content);
        } else if (Buffer.isBuffer(content)) {
            buffer = content;
        } else if (content === undefined || content === null) {
            buffer = Buffer.from('');
        } else {
            buffer = Buffer.from(JSON.stringify(content));
        }

        return {
            size: buffer.length,
            sha1Hash: crypto.createHash('sha1').update(buffer).digest('hex')
        };
    }

    createItem(item: Partial<DriveItem> & { name: string }, isFolder = false): DriveItem {
        if (!item.name) {
            throw new Error("Item name is required");
        }
        const id = item.id || Math.random().toString(36).substring(7);
        const now = new Date().toISOString();

        const newItem: DriveItem = {
            createdDateTime: now,
            lastModifiedDateTime: now,
            ...item,
            id,
            name: item.name,
            eTag: `W/"1"`,
            cTag: `"cTag-1"`,
            size: 0,
            parentReference: item.parentReference || { driveId: "b!", id: "root" }
        };

        if (isFolder) {
            newItem.folder = { childCount: 0 };
        } else {
            const stats = this.calculateStats(item.content);
            newItem.size = stats.size;
            newItem.file = {
                mimeType: item.file?.mimeType || "application/octet-stream",
                hashes: { sha1Hash: stats.sha1Hash }
            };
        }

        this.items.set(id, newItem);
        this.addDeltaHistory(newItem);

        // Update parent childCount if making a folder
        if (newItem.parentReference && newItem.parentReference.id) {
            this.incrementParentChildCount(newItem.parentReference.id, 1);
        }

        return newItem;
    }

    updateItem(id: string, updates: Partial<DriveItem>): DriveItem | null {
        const item = this.items.get(id);
        if (!item) return null;

        // Extract internal version number from etag to increment
        const currentVersion = parseInt(item.eTag.replace(/\D/g, '') || "1", 10);
        const newVersion = currentVersion + 1;

        const statsUpdates: Record<string, unknown> = {};
        if (updates.content !== undefined && item.file) {
            const stats = this.calculateStats(updates.content);
            statsUpdates.size = stats.size;
            statsUpdates.file = {
                ...item.file,
                hashes: { sha1Hash: stats.sha1Hash }
            };
        }

        const updatedItem: DriveItem = {
            ...item,
            ...updates,
            ...statsUpdates,
            eTag: `W/"${newVersion}"`,
            cTag: `"cTag-${newVersion}"`,
            lastModifiedDateTime: updates.lastModifiedDateTime || new Date().toISOString()
        };

        this.items.set(id, updatedItem);
        this.addDeltaHistory(updatedItem);
        return updatedItem;
    }

    getItem(id: string): DriveItem | null {
        return this.items.get(id) || null;
    }

    deleteItem(id: string): boolean {
        const item = this.items.get(id);
        if (!item) return false;

        const deleted = this.items.delete(id);
        if (deleted) {
            const deletedItem = {
                ...item,
                deleted: { state: "deleted" },
                lastModifiedDateTime: new Date().toISOString()
            };
            this.addDeltaHistory(deletedItem);

            // Decrement parent count
            if (item.parentReference && item.parentReference.id) {
                this.incrementParentChildCount(item.parentReference.id, -1);
            }
        }
        return deleted;
    }

    listItems(parentId?: string): DriveItem[] {
        const allItems = Array.from(this.items.values());
        if (!parentId) return allItems;

        return allItems.filter(i => i.parentReference?.id === parentId);
    }

    getAllItems(): DriveItem[] {
        return Array.from(this.items.values());
    }

    clear(): void {
        this.items.clear();
        this.deltaHistory = [];

        // Always recreate a standard root folder
        this.createItem({ id: 'root', name: 'root' }, true);
    }

    // Delta History (simulated changes API)
    private addDeltaHistory(item: DriveItem) {
        this.deltaHistory.push(JSON.parse(JSON.stringify(item)));
    }

    getDeltaToken(): string {
        return String(this.deltaHistory.length);
    }

    getDelta(token?: string): { items: DriveItem[], deltaLink: string } {
        const tokenIndex = token ? parseInt(token, 10) : 0;
        const start = isNaN(tokenIndex) ? 0 : Math.max(0, tokenIndex);

        const items = this.deltaHistory.slice(start);

        // In MS Graph, if a file transitions multiple states, delta should ideally just return the latest state
        // but for a mock, returning the log or deduping by id to latest state is standard.
        // Let's dedupe to match real API behavior mostly (returns latest state within the page)
        const dedupedMap = new Map<string, DriveItem>();
        for (const item of items) {
            dedupedMap.set(item.id, item);
        }

        const dedupedItems = Array.from(dedupedMap.values());
        const newToken = String(this.deltaHistory.length);

        return {
            items: dedupedItems,
            deltaLink: newToken
        };
    }

    private incrementParentChildCount(parentId: string, amount: number) {
        const parent = this.items.get(parentId);
        if (parent && parent.folder) {
            parent.folder.childCount = Math.max(0, parent.folder.childCount + amount);
        }
    }
}

export const driveStore = new DriveStore();
// Initialize root on boot
driveStore.clear();
