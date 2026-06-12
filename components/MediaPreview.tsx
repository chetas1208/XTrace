"use client";

import { useEffect, useMemo } from "react";
import { FileAudio, FileVideo, ImageIcon } from "lucide-react";
import type { DetectedMediaType } from "@/types/traceproof";
import { previewBucket, readableMediaType } from "@/lib/utils";

type Props = {
  /** Either a browser File (analyze page) or a server src URL (report page). */
  file?: File;
  src?: string;
  fileName: string;
  mediaType: DetectedMediaType;
};

export function MediaPreview({ file, src, fileName, mediaType }: Props) {
  const bucket = previewBucket(mediaType);

  // Create the blob URL during render (memoized per file) and revoke it on
  // unmount/file-change via a cleanup-only effect — no setState in an effect.
  const fileUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);

  const objectUrl = fileUrl ?? src ?? null;

  const icon = useMemo(() => {
    if (bucket === "image") return <ImageIcon className="h-4 w-4" aria-hidden="true" />;
    if (bucket === "audio") return <FileAudio className="h-4 w-4" aria-hidden="true" />;
    return <FileVideo className="h-4 w-4" aria-hidden="true" />;
  }, [bucket]);

  return (
    <section className="xt-glass rounded-2xl p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-text-primary">
            {icon}
            <span className="truncate">{fileName}</span>
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            {readableMediaType(mediaType)}
            {file ? ` · ${(file.size / 1024 / 1024).toFixed(2)} MB` : ""}
          </p>
        </div>
        <span className="rounded-md border border-cyan-signal/30 bg-cyan-signal/10 px-2.5 py-1 text-xs uppercase tracking-[0.14em] text-cyan-signal">
          {file ? "Ready" : "Stored"}
        </span>
      </div>

      {objectUrl && bucket === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={objectUrl} alt="" className="max-h-80 w-full rounded-md object-contain ring-1 ring-border" />
      ) : null}
      {objectUrl && bucket === "video" ? (
        <video src={objectUrl} controls className="max-h-80 w-full rounded-md ring-1 ring-border" />
      ) : null}
      {objectUrl && bucket === "audio" ? <audio src={objectUrl} controls className="w-full" /> : null}
      {!objectUrl ? (
        <p className="rounded-md border border-border bg-background/55 p-4 text-sm text-text-secondary">
          Preview unavailable.
        </p>
      ) : null}
    </section>
  );
}
