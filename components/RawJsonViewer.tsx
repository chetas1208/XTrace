"use client";

import { useState } from "react";
import { Braces, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Collapsible raw-JSON viewer. The report page passes the actual model-server
 * response so reviewers can see exactly what the GPU server returned.
 */
export function RawJsonViewer({ title = "Raw model server response", data }: { title?: string; data: unknown }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="xt-glass rounded-2xl p-5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-lg font-semibold text-text-primary">
          <Braces className="h-5 w-5 text-cyan-signal" aria-hidden="true" />
          {title}
        </span>
        <ChevronDown className={cn("h-5 w-5 text-text-secondary transition", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open ? (
        <pre className="mt-4 max-h-[32rem] overflow-auto rounded-md border border-border bg-background p-4 text-xs leading-6 text-text-secondary">
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : null}
    </section>
  );
}
