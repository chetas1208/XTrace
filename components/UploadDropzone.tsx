"use client";

import { ChangeEvent, DragEvent, useId, useState } from "react";
import { FileUp, ShieldAlert } from "lucide-react";
import type { DetectedMediaType } from "@/types/traceproof";
import {
  ACCEPT_ATTR,
  cn,
  detectMediaTypeClient,
  MAX_UPLOAD_BYTES,
  UNSUPPORTED_FILE_MESSAGE,
} from "@/lib/utils";

type Props = {
  onFileSelected: (file: File, detectedMediaType: Exclude<DetectedMediaType, "unsupported">) => void;
  disabled?: boolean;
};

export function UploadDropzone({ onFileSelected, disabled = false }: Props) {
  const inputId = useId();
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFile(file: File | undefined) {
    setError(null);
    if (!file) return;

    if (file.size === 0) {
      setError("That file is empty. Please choose a different file.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`File is too large. Maximum size is ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`);
      return;
    }

    const detected = detectMediaTypeClient(file);
    if (detected === "unsupported") {
      setError(UNSUPPORTED_FILE_MESSAGE);
      return;
    }

    onFileSelected(file, detected);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    handleFile(event.dataTransfer.files[0]);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    handleFile(event.target.files?.[0]);
  }

  return (
    <div className="space-y-3">
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-panel p-8 text-center transition",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-cyan-signal/70 hover:bg-panel-soft",
          isDragging && "border-cyan-signal bg-cyan-signal/10",
        )}
      >
        <input
          id={inputId}
          type="file"
          accept={ACCEPT_ATTR}
          className="sr-only"
          onChange={handleChange}
          disabled={disabled}
        />
        <span className="grid h-14 w-14 place-items-center rounded-md border border-cyan-signal/35 bg-cyan-signal/10">
          <FileUp className="h-7 w-7 text-cyan-signal" aria-hidden="true" />
        </span>
        <span className="mt-5 text-lg font-semibold text-text-primary">Drop media to launch XTrace agent</span>
        <span className="mt-2 max-w-lg text-sm leading-6 text-text-secondary">
          Drag and drop a single file, or click to browse. The media type is detected automatically — no mode
          selection required.
        </span>
        <span className="mt-4 text-xs uppercase tracking-[0.14em] text-text-secondary">
          Accepted: JPG · JPEG · PNG · WEBP · MP4 · MOV · WEBM · WAV · MP3 · M4A
        </span>
      </label>
      {error ? (
        <p className="flex items-center gap-2 rounded-md border border-red-risk/35 bg-red-risk/10 px-3 py-2 text-sm text-red-risk">
          <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
