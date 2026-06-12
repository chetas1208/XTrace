"use client";

import { useEffect, useState } from "react";
import { Plug } from "lucide-react";
import { cn } from "@/lib/utils";

type SponsorEntry = { enabled: boolean; available?: boolean; configured?: boolean; role: string; mode?: string };

type SystemStatus = {
  sponsors?: {
    render: SponsorEntry;
    guild: SponsorEntry;
    composio: SponsorEntry;
    jua: SponsorEntry;
    openui: SponsorEntry;
  };
};

const ORDER: Array<{ key: keyof NonNullable<SystemStatus["sponsors"]>; label: string }> = [
  { key: "render", label: "Render" },
  { key: "guild", label: "Guild" },
  { key: "composio", label: "Composio" },
  { key: "jua", label: "Jua" },
  { key: "openui", label: "OpenUI" },
];

function dotClass(entry: SponsorEntry | undefined): string {
  if (!entry || !entry.enabled) return "bg-text-secondary";
  const ready = entry.configured ?? entry.available;
  if (ready === undefined) return "bg-green-verified";
  return ready ? "bg-green-verified" : "bg-amber-risk";
}

function statusText(entry: SponsorEntry | undefined): string {
  if (!entry || !entry.enabled) return "disabled";
  const ready = entry.configured ?? entry.available;
  if (ready === undefined) return "enabled";
  return ready ? "configured" : "enabled, not configured";
}

export function SponsorStatusCard() {
  const [sponsors, setSponsors] = useState<SystemStatus["sponsors"] | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/system-status")
      .then((r) => r.json())
      .then((data: SystemStatus) => {
        if (active) setSponsors(data.sponsors ?? null);
      })
      .catch(() => {
        if (active) setSponsors(null);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="xt-glass rounded-2xl p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
        <Plug className="h-5 w-5 text-cyan-signal" aria-hidden="true" />
        Sponsor integrations
      </h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {ORDER.map(({ key, label }) => {
          const entry = sponsors?.[key];
          return (
            <div key={key} className="rounded-xl border border-border bg-background/55 p-3">
              <div className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", dotClass(entry))} aria-hidden="true" />
                <span className="text-sm font-medium text-text-primary">{label}</span>
              </div>
              <p className="mt-1 text-xs text-text-secondary">{entry?.role ?? "—"}</p>
              <p className="mt-1 text-xs text-text-secondary">{sponsors ? statusText(entry) : "…"}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
