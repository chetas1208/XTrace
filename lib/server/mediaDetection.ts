import { mkdir, open, writeFile } from "node:fs/promises";
import path from "node:path";
import { baseFromExtension, baseFromMime } from "@/lib/utils";
import { runCommand } from "@/lib/server/command";

export type BaseMediaType = "image" | "audio" | "video";

export function sanitizeFileName(fileName: string): string {
  const baseName = path.basename(fileName || "uploaded-media");
  return baseName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "uploaded-media";
}

/**
 * Inspect the first bytes of a file to recover a media bucket independent of
 * the (spoofable) extension and client-provided MIME type.
 */
function baseFromMagic(header: Buffer): BaseMediaType | null {
  if (header.length < 12) return null;

  // PNG
  if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47) return "image";
  // JPEG
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return "image";

  const ascii4 = (offset: number) => header.toString("ascii", offset, offset + 4);

  // RIFF container: WEBP (image) or WAVE (audio)
  if (ascii4(0) === "RIFF") {
    const form = ascii4(8);
    if (form === "WEBP") return "image";
    if (form === "WAVE") return "audio";
  }

  // ISO BMFF (mp4/mov/m4a): "ftyp" at offset 4, brand at offset 8
  if (ascii4(4) === "ftyp") {
    const brand = ascii4(8).trim().toLowerCase();
    if (brand.startsWith("m4a") || brand === "m4b" || brand === "mp41a") return "audio";
    // qt, isom, mp42, iso5, avc1, mp4v, dash, etc. -> video container
    return "video";
  }

  // Matroska / WebM (EBML header)
  if (header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3) return "video";

  // MP3: ID3 tag or MPEG audio frame sync
  if (ascii4(0).startsWith("ID3")) return "audio";
  if (header[0] === 0xff && (header[1] & 0xe0) === 0xe0) return "audio";

  return null;
}

async function readHeader(filePath: string, length = 32): Promise<Buffer | null> {
  try {
    const handle = await open(filePath, "r");
    try {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, 0);
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

/**
 * Best-effort ffprobe confirmation. ffprobe is optional in this environment;
 * if it is missing or errors, we silently fall through to other signals.
 */
async function baseFromFfprobe(filePath: string): Promise<BaseMediaType | null> {
  const result = await runCommand(
    "ffprobe",
    ["-v", "error", "-print_format", "json", "-show_streams", filePath],
    15000,
  );
  if (result.exitCode !== 0 || result.error || !result.stdout) return null;
  try {
    const parsed = JSON.parse(result.stdout) as { streams?: Array<{ codec_type?: string }> };
    const streams = parsed.streams ?? [];
    const hasVideo = streams.some((s) => s.codec_type === "video");
    const hasAudio = streams.some((s) => s.codec_type === "audio");
    if (hasVideo) return "video";
    if (hasAudio) return "audio";
  } catch {
    return null;
  }
  return null;
}

/**
 * Resolve the base media type using, in order: MIME type, extension,
 * magic-number signature, then (optionally) ffprobe. Returns "unsupported"
 * when no signal resolves to a supported bucket.
 *
 * The video_with_audio distinction is intentionally NOT made here; the GPU
 * model server decides that and reports it in its response media_type.
 */
export async function detectMediaType(params: {
  fileName: string;
  mimeType?: string;
  filePath?: string;
}): Promise<"image" | "audio" | "video" | "unsupported"> {
  const mimeGuess = baseFromMime(params.mimeType);
  const extGuess = baseFromExtension(params.fileName);

  let magicGuess: BaseMediaType | null = null;
  if (params.filePath) {
    const header = await readHeader(params.filePath);
    if (header) magicGuess = baseFromMagic(header);
  }

  // Priority: a concrete container signature (magic) wins when it disagrees
  // with a generic MIME bucket; otherwise MIME, then extension, then ffprobe.
  const resolved =
    magicGuess ??
    mimeGuess ??
    extGuess ??
    (params.filePath ? await baseFromFfprobe(params.filePath) : null);

  return resolved ?? "unsupported";
}

export async function persistUpload(file: File, jobId: string, fileName: string): Promise<string> {
  const uploadDir = path.join(process.cwd(), "uploads", jobId);
  await mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, fileName);
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, bytes);
  return filePath;
}
