"use client";

import { useState } from "react";
import { Github, Loader2, NotebookPen, Send } from "lucide-react";
import type { ComposioActionResult, ComposioActionType, TraceProofReport } from "@/types/traceproof";
import { actionReportPayload } from "@/lib/sessionReport";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ActionKey = "github" | "slack" | "notion";

const ACTION_META: Record<ActionKey, { path: string; action: ComposioActionType; label: string }> = {
  github: { path: "/api/actions/create-github-issue", action: "github_issue", label: "Create GitHub Issue" },
  slack: { path: "/api/actions/send-slack", action: "slack_summary", label: "Send Slack Summary" },
  notion: { path: "/api/actions/save-notion", action: "notion_page", label: "Save Notion Page" },
};

function resultClass(status: ComposioActionResult["status"]): string {
  if (status === "success") return "border-green-verified/40 bg-green-verified/10 text-green-verified";
  if (status === "failed") return "border-red-risk/45 bg-red-risk/10 text-red-risk";
  return "border-amber-risk/40 bg-amber-risk/10 text-amber-risk";
}

function emptyResult(action: ComposioActionType, message: string): ComposioActionResult {
  return {
    provider: "Composio",
    action,
    status: "failed",
    external_url: null,
    message,
    raw: null,
    url: null,
    timestamp: new Date().toISOString(),
  };
}

export function ComposioActionPanel({ report }: { report: TraceProofReport }) {
  const [pending, setPending] = useState<ActionKey | null>(null);
  const [results, setResults] = useState<Record<ActionKey, ComposioActionResult | null>>({
    github: null,
    slack: null,
    notion: null,
  });

  async function runAction(key: ActionKey) {
    const meta = ACTION_META[key];
    setPending(key);
    try {
      const response = await fetch(meta.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(actionReportPayload(report)),
      });
      const data = (await response.json().catch(() => null)) as ComposioActionResult | null;
      setResults((prev) => ({
        ...prev,
        [key]: data ?? emptyResult(meta.action, "No response from action route."),
      }));
    } catch {
      setResults((prev) => ({
        ...prev,
        [key]: emptyResult(meta.action, "Action request failed."),
      }));
    } finally {
      setPending(null);
    }
  }

  function icon(key: ActionKey) {
    if (pending === key) return <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />;
    if (key === "github") return <Github className="h-4 w-4" aria-hidden="true" />;
    if (key === "slack") return <Send className="h-4 w-4" aria-hidden="true" />;
    return <NotebookPen className="h-4 w-4" aria-hidden="true" />;
  }

  return (
    <section className="xt-glass rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-text-primary">Composio Actions</h2>
        <span className="rounded-md border border-cyan-signal/35 bg-cyan-signal/10 px-2 py-1 text-xs text-cyan-signal">
          actions after report
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {(["github", "slack", "notion"] as ActionKey[]).map((key) => (
          <Button
            key={key}
            type="button"
            variant={key === "github" ? "primary" : "secondary"}
            disabled={pending !== null}
            onClick={() => runAction(key)}
          >
            {icon(key)}
            {ACTION_META[key].label}
          </Button>
        ))}
      </div>

      {(["github", "slack", "notion"] as ActionKey[]).map((key) => {
        const result = results[key];
        if (!result) return null;
        const url = result.external_url ?? result.url;
        return (
          <div key={key} className={cn("mt-3 rounded-md border px-3 py-2 text-sm", resultClass(result.status))}>
            <span className="font-medium capitalize">{result.status}</span>: {result.message}
            {url ? (
              <>
                {" "}
                <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
                  view
                </a>
              </>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
