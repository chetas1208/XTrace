import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Ephemeral upload storage for a single /api/analyze request.
 * Files are deleted after analysis completes — nothing is persisted.
 */

export async function saveTempUpload(file: File, fileName: string): Promise<{ filePath: string; tempDir: string }> {
  const tempDir = path.join(os.tmpdir(), `xtrace-${crypto.randomUUID()}`);
  await mkdir(tempDir, { recursive: true });
  const filePath = path.join(tempDir, fileName);
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, bytes);
  return { filePath, tempDir };
}

export async function deleteTempUpload(tempDir: string | null): Promise<void> {
  if (!tempDir) return;
  try {
    await rm(tempDir, { recursive: true, force: true });
  } catch (error) {
    console.error("[tempUpload] failed to delete temp dir:", error);
  }
}
