export interface StorageAdapter {
  save(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<{ stream: NodeJS.ReadableStream; sizeBytes: number } | null>;
  delete(key: string): Promise<void>;
}
