"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { AlertTriangle } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { ReportView } from "@/components/ReportView";
import { loadSessionReport } from "@/lib/sessionReport";

function subscribeSessionReport(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

function getSessionReportSnapshot() {
  return loadSessionReport();
}

export default function CurrentReportPage() {
  const report = useSyncExternalStore(subscribeSessionReport, getSessionReportSnapshot, () => null);

  return (
    <main className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {report ? (
          <ReportView report={report} />
        ) : (
          <section className="rounded-lg border border-amber-risk/35 bg-amber-risk/10 p-6">
            <AlertTriangle className="h-6 w-6 text-amber-risk" aria-hidden="true" />
            <h1 className="mt-4 text-2xl font-semibold text-text-primary">No active XTrace report</h1>
            <p className="mt-3 text-text-secondary">Analyze media again to generate a session report.</p>
            <Link
              href="/analyze"
              className="mt-6 inline-flex rounded-md bg-cyan-signal px-4 py-2.5 text-sm font-semibold text-background"
            >
              Launch XTrace agent
            </Link>
          </section>
        )}
      </div>
    </main>
  );
}
