import Link from "next/link";
import { ArrowRight, FileSearch, GitMerge, Workflow } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { ForensicOrb } from "@/components/ForensicOrb";
import { Button } from "@/components/ui/button";

const CORE_CARDS = [
  {
    title: "Multimodal GPU Forensics",
    description:
      "Image, video, and audio detectors run on a tunneled HPC GPU server and return real model-backed signals, never random scores.",
    icon: FileSearch,
  },
  {
    title: "Evidence Graph Reasoning",
    description:
      "Signals flow through a forensic evidence graph and Anthropic Claude summarizes the evidence into careful, uncertainty-preserving language.",
    icon: Workflow,
  },
  {
    title: "Actionable Provenance Reports",
    description:
      "Route a report to GitHub, Slack, or Notion via Composio, record the run with Guild, and check weather/location claims with Jua.",
    icon: GitMerge,
  },
];

const SPONSORS = ["Render", "Anthropic", "Guild", "Composio", "Jua", "OpenUI"];

export default function Home() {
  return (
    <main className="min-h-screen">
      <AppHeader />

      <section className="relative mx-auto grid min-h-[calc(100vh-4.6rem)] max-w-7xl content-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
        <div className="flex flex-col justify-center">
          <p className="mb-4 text-sm uppercase tracking-[0.24em] text-cyan-signal">
            Web agent for multimodal media forensics
          </p>
          <h1 className="text-6xl font-semibold tracking-tight sm:text-7xl">
            <span className="xt-text-gradient">XTrace</span>
          </h1>
          <p className="mt-4 text-2xl font-medium text-text-primary">Follow the signal. Verify the source.</p>
          <p className="mt-5 max-w-2xl leading-7 text-text-secondary">
            XTrace is a web agent for multimodal media forensics. It finds AI media footprints across images, videos,
            and audio, then turns real GPU model evidence into an explainable provenance-risk report, not a fake/real
            verdict.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/analyze">
                Analyze Media
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>

          <div className="mt-10">
            <p className="text-xs uppercase tracking-[0.18em] text-text-secondary">Powered by</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SPONSORS.map((name) => (
                <span
                  key={name}
                  className="rounded-full border border-border bg-panel/60 px-3 py-1.5 text-xs text-text-secondary backdrop-blur"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="relative grid place-items-center">
          <div className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-cyan-signal/5 blur-3xl" />
          <ForensicOrb height={420} />
        </div>
      </section>

      <section className="border-t border-border/70 px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-3">
          {CORE_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <article key={card.title} className="xt-glass xt-glass-hover rounded-2xl p-6">
                <span className="xt-glow-cyan grid h-11 w-11 place-items-center rounded-xl border border-cyan-signal/40 bg-cyan-signal/10">
                  <Icon className="h-5 w-5 text-cyan-signal" aria-hidden="true" />
                </span>
                <h2 className="mt-5 text-lg font-semibold text-text-primary">{card.title}</h2>
                <p className="mt-2 text-sm leading-6 text-text-secondary">{card.description}</p>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
