import Link from "next/link";
import { Activity, Fingerprint } from "lucide-react";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="XTrace home">
          <span className="xt-glow-cyan grid h-10 w-10 place-items-center rounded-xl border border-cyan-signal/40 bg-cyan-signal/10">
            <Fingerprint className="h-5 w-5 text-cyan-signal" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-base font-semibold tracking-wide text-text-primary">XTrace</span>
            <span className="block text-xs text-text-secondary">Multimodal forensic provenance-risk engine</span>
          </span>
        </Link>
        <nav className="flex items-center gap-2 text-sm text-text-secondary">
          <Link className="rounded-md px-3 py-2 hover:bg-panel-soft hover:text-text-primary" href="/analyze">
            Analyze
          </Link>
          <span className="hidden items-center gap-2 rounded-md border border-border bg-panel px-3 py-2 text-xs uppercase tracking-[0.14em] text-cyan-signal sm:flex">
            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
            Live evidence
          </span>
        </nav>
      </div>
    </header>
  );
}
