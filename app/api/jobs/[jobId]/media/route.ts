import { readFile } from "node:fs/promises";
import { getJob } from "@/lib/server/jobStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXTENSION_CONTENT_TYPE: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
};

function resolveContentType(fileName: string, storedMime: string): string {
  if (storedMime && storedMime !== "application/octet-stream") return storedMime;
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return EXTENSION_CONTENT_TYPE[ext] ?? storedMime ?? "application/octet-stream";
}

/**
 * Streams the originally uploaded file back to the browser for the report
 * preview. This serves bytes from the hosted app's own storage; it never
 * proxies or exposes the model-server tunnel.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  const { jobId } = await params;

  if (!jobId || jobId.length > 120) {
    return new Response("Invalid job id.", { status: 400 });
  }

  const job = await getJob(jobId);
  if (!job) {
    return new Response("Job not found.", { status: 404 });
  }

  try {
    const bytes = await readFile(job.filePath);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": resolveContentType(job.fileName, job.mimeType),
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename="${encodeURIComponent(job.fileName)}"`,
      },
    });
  } catch {
    return new Response("Media file is no longer available.", { status: 404 });
  }
}
