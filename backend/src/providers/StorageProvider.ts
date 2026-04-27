import { createHash } from 'crypto';
import { StorageError, StorageIntegrityError, ValidationError } from '../errors/AppError';
import { withRetry } from '../utils/retry';

/**
 * Interface for 0G Storage Provider.
 * Future implementation should wrap @0glabs/0g-storage-ts
 */
export class StorageProvider {
    private rpcUrl: string;
    private readonly inMemory = new Map<string, Buffer>();

    constructor(rpcUrl: string) {
        if (!rpcUrl) {
            throw new ValidationError("RPC URL is required for StorageProvider", "CFG_001_INVALID_ENV");
        }
        this.rpcUrl = rpcUrl;
    }

    /**
     * Uploads data to 0G Storage.
     * @param data The data to upload.
     * @returns The root hash of the uploaded data.
     */
    async upload(data: Buffer): Promise<string> {
        if (!data || data.length === 0) {
            throw new ValidationError("Cannot upload empty data");
        }
        if (data.length > 1024 * 1024 * 2) {
            throw new ValidationError("Payload too large for storage upload", "STORAGE_001_UPLOAD_FAILED", { maxBytes: 1024 * 1024 * 2, actualBytes: data.length });
        }

        return withRetry(
            async () => {
                const hash = createHash('sha256').update(data).digest('hex');
                const rootHash = `0x${hash}`;
                this.inMemory.set(rootHash, data);
                return rootHash;
            },
            (error) => error instanceof StorageError ? error.retryable : false,
            { retries: 2 }
        ).catch((error) => {
            throw new StorageError("Failed to upload artifact to 0G Storage", "STORAGE_001_UPLOAD_FAILED", {
                operation: "storage.upload",
                rpcUrl: this.rpcUrl,
                size: data.length,
            }, true);
        });
    }

    /**
     * Downloads data from 0G Storage.
     * @param rootHash The root hash of the data to download.
     * @returns The downloaded data as a Buffer.
     */
    async download(rootHash: string): Promise<Buffer> {
        if (!rootHash || !/^0x[a-fA-F0-9]{64}$/.test(rootHash)) {
            throw new ValidationError("Invalid root hash format", "STORAGE_002_DOWNLOAD_FAILED", { rootHash });
        }
        const stored = this.inMemory.get(rootHash);
        if (!stored) {
            throw new StorageError("Storage object not found", "STORAGE_002_DOWNLOAD_FAILED", { rootHash, operation: "storage.download" }, false);
        }
        const computed = `0x${createHash('sha256').update(stored).digest('hex')}`;
        if (computed !== rootHash) {
            throw new StorageIntegrityError("Stored content hash mismatch", { rootHash, computed, operation: "storage.verifyHash" });
        }
        return stored;
    }
}
