"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  Film,
  ImageIcon,
  Loader2,
  Package,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import type { ExportItem, ExportPlan, SceneDisclosureReview } from "@/domain/export-plan";
import { MP4_SETTINGS } from "@/domain/export-settings";
import type { PublicExportJob } from "@/server/export/jobs";
import { downloadUrl, formatBytes, useExportJob } from "./use-export-job";

type JobItem = PublicExportJob["items"][number];

function seconds(ms: number) {
  return `${(ms / 1000).toFixed(1)} s`;
}

/** "45 s" / "3 min 10 s". */
function duration(ms: number) {
  const total = Math.max(1, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  return m ? `${m} min ${total % 60} s` : `${total} s`;
}

function StatusIcon({ status }: { status: JobItem["status"] | undefined }) {
  if (status === "done") return <CheckCircle2 className="size-4 text-emerald-600" aria-label="Done" />;
  if (status === "failed") return <XCircle className="text-destructive size-4" aria-label="Failed" />;
  if (status === "rendering") return <Loader2 className="size-4 animate-spin" aria-label="Rendering" />;
  if (status === "queued") return <Clock className="text-muted-foreground size-4" aria-label="Queued" />;
  return <span className="size-4" />;
}

/** One asset row: specs, live status, and its own single-file export. */
function AssetRow({
  item,
  jobItem,
  job,
  projectId,
  blocked,
}: {
  item: ExportItem;
  jobItem: JobItem | undefined;
  job: PublicExportJob | null;
  projectId: string;
  /** Unresolved disclosure errors in this scene that haven't been acknowledged. */
  blocked: boolean;
}) {
  const single = useExportJob(projectId, item.sceneId);
  const singleItem = single.job?.items[0];
  const shown = jobItem ?? singleItem;
  const Icon = item.format === "png" ? ImageIcon : Film;
  return (
    <li
      className="flex flex-wrap items-center gap-3 py-2.5"
      data-testid={`export-row-${item.key}`}
      data-status={shown?.status ?? "idle"}
    >
      <StatusIcon status={shown?.status} />
      <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.filename}</p>
        <p className="text-muted-foreground text-xs">
          {item.label} · {item.format.toUpperCase()} · {item.width}×{item.height}
          {item.format === "mp4" ? ` · ${seconds(item.durationMs)} · 30 fps · H.264` : " · still PNG"}
          {item.sceneName !== item.label && ` · from “${item.sceneName}”`}
        </p>
        {shown?.status === "rendering" && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="bg-muted h-1 w-full max-w-xs overflow-hidden rounded-full" aria-hidden>
              <div
                className="bg-foreground h-full transition-[width]"
                style={{ width: `${Math.round(shown.progress * 100)}%` }}
              />
            </div>
            {item.format === "mp4" && (
              <span className="text-muted-foreground text-[11px] tabular-nums" data-testid={`frames-${item.key}`}>
                {shown.renderedFrames}/{shown.frames} frames
              </span>
            )}
          </div>
        )}
        {shown?.status === "done" && shown.renderMs !== null && (
          <p className="text-muted-foreground mt-0.5 text-[11px] tabular-nums" data-testid={`render-time-${item.key}`}>
            Rendered in {seconds(shown.renderMs)}
            {item.format === "mp4" &&
              ` · ${shown.frames} frames · ${((shown.frames * 1000) / shown.renderMs).toFixed(1)} fps`}
          </p>
        )}
        {shown?.error && (
          <p role="alert" className="text-destructive mt-1 text-xs">
            {shown.error}
          </p>
        )}
        {shown?.warnings.map((w) => (
          <p key={w} className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            {w}
          </p>
        ))}
        {single.error && <p className="text-destructive mt-1 text-xs">{single.error}</p>}
      </div>
      <div className="flex items-center gap-2 text-xs">
        {shown?.status === "done" && (
          <span className="text-muted-foreground tabular-nums">
            {formatBytes(shown.bytes)}
            {shown.bitrateKbps !== null && (
              <span data-testid={`measured-bitrate-${item.key}`}>
                {" "}
                · measured {(shown.bitrateKbps / 1000).toFixed(2)} Mbps
              </span>
            )}
            {shown.cached && " · reused"}
          </span>
        )}
        {jobItem?.status === "done" && job && (
          <Button variant="ghost" size="xs" asChild>
            <a href={downloadUrl(job, jobItem.key)} download>
              <Download /> File
            </a>
          </Button>
        )}
        {!jobItem && singleItem?.status === "done" && single.job && (
          <Button variant="ghost" size="xs" asChild>
            <a href={downloadUrl(single.job, singleItem.key)} download data-testid={`single-download-${item.key}`}>
              <Download /> Download
            </a>
          </Button>
        )}
        {!jobItem && (
          <Button
            variant="outline"
            size="xs"
            disabled={single.active || blocked}
            title={blocked ? "Review the disclosure problems above first" : undefined}
            onClick={() => void single.start()}
            data-testid={`single-export-${item.key}`}
          >
            {single.active ? <Loader2 className="animate-spin" /> : null}
            Export {item.format.toUpperCase()}
          </Button>
        )}
      </div>
    </li>
  );
}

/**
 * Pre-export disclosure review. Problems never block silently and never disappear from
 * the output: the user either fixes them in the editor or explicitly exports anyway.
 */
function DisclosureReviewCard({
  projectId,
  review,
  acknowledged,
  onAcknowledge,
}: {
  projectId: string;
  review: SceneDisclosureReview[];
  acknowledged: boolean;
  onAcknowledge: (value: boolean) => void;
}) {
  const withIssues = review.filter((r) => r.issues.length > 0);
  const disclosures = review.reduce((sum, r) => sum + r.disclosures, 0);
  const errors = withIssues.some((r) => r.issues.some((i) => i.severity === "error"));
  if (withIssues.length === 0) {
    return (
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs" data-testid="disclosure-review-ok">
        <ShieldCheck className="size-3.5 text-emerald-600" aria-hidden />
        {disclosures > 0
          ? `Disclosure review: ${disclosures} ${disclosures === 1 ? "disclosure" : "disclosures"} present, visible, readable and inside the safe area.`
          : "Disclosure review: no photo in this package requires a disclosure."}
      </p>
    );
  }
  return (
    <section
      aria-labelledby="disclosure-review-heading"
      className={cn(
        "rounded-xl border px-4 py-3",
        errors ? "border-destructive/50 bg-destructive/5" : "border-amber-500/50 bg-amber-500/5",
      )}
      data-testid="disclosure-review"
    >
      <h3 id="disclosure-review-heading" className="flex items-center gap-1.5 text-sm font-semibold">
        <AlertTriangle className={cn("size-4", errors ? "text-destructive" : "text-amber-600")} aria-hidden />
        Disclosure review
      </h3>
      <ul className="mt-2 space-y-2">
        {withIssues.map((r) => (
          <li key={r.sceneId} className="text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{r.sceneName}</span>
              <Link
                href={`/projects/${projectId}/editor?scene=${r.sceneId}`}
                className="text-primary text-[11px] underline-offset-2 hover:underline"
              >
                Fix in editor
              </Link>
            </div>
            <ul className="mt-1 space-y-0.5">
              {r.issues.map((issue, i) => (
                <li
                  key={i}
                  className={issue.severity === "error" ? "text-destructive" : "text-amber-800 dark:text-amber-300"}
                  data-testid="export-disclosure-issue"
                >
                  {issue.severity === "error" ? "Problem: " : "Check: "}
                  {issue.message}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {errors && (
        <label className="mt-3 flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => onAcknowledge(e.target.checked)}
            data-testid="disclosure-acknowledge"
          />
          I’ve reviewed these disclosure problems and want to export anyway. (They’re also listed with each affected
          file.)
        </label>
      )}
    </section>
  );
}

/** Read-only: the standardized settings every MP4 in this export uses. */
function ExportSettingsSummary() {
  const rows: [string, string][] = [
    ["Format", "H.264 MP4"],
    ["Frame Rate", `${MP4_SETTINGS.fps} FPS`],
    ["Target Bitrate", `${MP4_SETTINGS.targetBitrateKbps / 1000} Mbps`],
    ["Resolution", "Match Scene"],
    ["Duration", "Match Scene"],
  ];
  return (
    <section
      aria-labelledby="settings-heading"
      className="border-border rounded-xl border px-4 py-3"
      data-testid="export-settings"
    >
      <h3 id="settings-heading" className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        Video export settings
      </h3>
      <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-5">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-muted-foreground mt-2 text-[11px]">
        Applies to every MP4 (package and individual exports): H.264 High profile, yuv420p, constant frame rate. The CTA
        is exported as a {"1080×300"} PNG. Measured bitrate varies with content and is shown per file.
      </p>
    </section>
  );
}

/**
 * Ready to Export: optional preview, then one ZIP with the Motion Tile and the Facebook
 * Build. Progress, errors and downloads all come from the real export job.
 */
export function ExportPanel({
  projectId,
  plan,
  review,
  demoMode,
}: {
  projectId: string;
  plan: ExportPlan;
  review: SceneDisclosureReview[];
  demoMode: boolean;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const hasErrors = review.some((r) => r.issues.some((i) => i.severity === "error"));
  const blockedScenes = new Set(
    acknowledged ? [] : review.filter((r) => r.issues.some((i) => i.severity === "error")).map((r) => r.sceneId),
  );
  const pkg = useExportJob(projectId);
  const job = pkg.job;
  const tile = plan.items.filter((i) => i.folder === "Motion_Tile");
  const build = plan.items.filter((i) => i.folder === "Facebook_Build");
  const mp4s = build.filter((i) => i.format === "mp4").length;
  const pngs = build.filter((i) => i.format === "png").length;
  const jobItem = (key: string) => job?.items.find((i) => i.key === key);
  const failed = job?.status === "failed";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
        <section className="border-border rounded-xl border p-5">
          <Eye className="text-muted-foreground size-5" aria-hidden />
          <h2 className="mt-2 text-sm font-semibold">Preview Experience</h2>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            Optional. See the Motion Tile in a simulated mobile feed and tap Learn More to scroll the Facebook Build.
          </p>
          <Button variant="outline" size="sm" className="mt-4" asChild>
            <Link href={`/projects/${projectId}/preview`}>Open preview</Link>
          </Button>
        </section>

        <section className="border-border rounded-xl border p-5" aria-labelledby="package-heading">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Package className="text-muted-foreground size-5" aria-hidden />
              <h2 id="package-heading" className="mt-2 text-sm font-semibold">
                Export Creative Package
              </h2>
              <p className="text-muted-foreground mt-1 text-xs">
                {plan.zipName} · {plan.items.length} assets: Motion Tile (MP4) + Facebook Build ({mp4s} MP4
                {pngs ? ` + ${pngs} PNG` : ""})
              </p>
            </div>
            <div className="flex items-center gap-2">
              {job?.status === "ready" && (
                <Button asChild>
                  <a href={downloadUrl(job)} download data-testid="download-zip">
                    <Download /> Download ZIP{job.zipBytes ? ` · ${formatBytes(job.zipBytes)}` : ""}
                  </a>
                </Button>
              )}
              {failed && (
                <Button variant="outline" onClick={() => void pkg.retry()} data-testid="retry-export">
                  <RotateCcw /> Retry failed
                </Button>
              )}
              <Button
                onClick={() => void pkg.start()}
                disabled={pkg.active || plan.items.length === 0 || (hasErrors && !acknowledged)}
                title={hasErrors && !acknowledged ? "Review the disclosure problems below first" : undefined}
                variant={job?.status === "ready" ? "outline" : "default"}
                data-testid="export-zip"
              >
                {pkg.active ? <Loader2 className="animate-spin" /> : <Package />}
                {job?.status === "ready" ? "Export again" : "Export ZIP"}
              </Button>
            </div>
          </div>

          {job && (
            <div className="mt-4 space-y-1.5" role="status" aria-live="polite" data-testid="export-progress">
              <div className="flex items-center justify-between text-xs">
                <span className={cn("font-medium", failed && "text-destructive")} data-testid="export-stage">
                  {job.stage}
                </span>
                <span className="text-muted-foreground tabular-nums" data-testid="export-percent">
                  {job.status === "ready"
                    ? `Done in ${duration(job.elapsedMs)}`
                    : `${Math.round(job.progress * 100)}%${job.etaMs ? ` · about ${duration(job.etaMs)} left` : ""}`}
                </span>
              </div>
              <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                <div
                  className={cn("h-full transition-[width]", failed ? "bg-destructive" : "bg-foreground")}
                  style={{ width: `${Math.round(job.progress * 100)}%` }}
                />
              </div>
              {job.error && (
                <p role="alert" className="text-destructive text-xs">
                  {job.error} Fix the problem listed below, then retry — finished assets are reused.
                </p>
              )}
            </div>
          )}
          {pkg.error && (
            <p role="alert" className="text-destructive mt-3 text-xs">
              {pkg.error}
            </p>
          )}
          {plan.missing.length > 0 && (
            <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              Missing from this project: {plan.missing.join(", ")}. The package is exported without them.
            </p>
          )}
        </section>
      </div>

      <DisclosureReviewCard
        projectId={projectId}
        review={review}
        acknowledged={acknowledged}
        onAcknowledge={setAcknowledged}
      />

      <ExportSettingsSummary />

      <section aria-labelledby="tile-heading">
        <h3 id="tile-heading" className="text-muted-foreground mb-1 text-[11px] font-medium tracking-wide uppercase">
          Motion_Tile/
        </h3>
        <ul className="divide-border border-border divide-y rounded-xl border px-4">
          {tile.map((item) => (
            <AssetRow
              key={item.key}
              item={item}
              jobItem={jobItem(item.key)}
              job={job}
              projectId={projectId}
              blocked={blockedScenes.has(item.sceneId)}
            />
          ))}
        </ul>
      </section>
      <section aria-labelledby="build-heading">
        <h3 id="build-heading" className="text-muted-foreground mb-1 text-[11px] font-medium tracking-wide uppercase">
          Facebook_Build/
        </h3>
        <ul className="divide-border border-border divide-y rounded-xl border px-4">
          {build.map((item) => (
            <AssetRow
              key={item.key}
              item={item}
              jobItem={jobItem(item.key)}
              job={job}
              projectId={projectId}
              blocked={blockedScenes.has(item.sceneId)}
            />
          ))}
        </ul>
      </section>

      {plan.notIncluded.length > 0 && (
        <p className="text-muted-foreground text-xs">
          Not in the package (export individually from the editor): {plan.notIncluded.map((s) => s.name).join(", ")}.
        </p>
      )}
      <p className="text-muted-foreground text-xs leading-relaxed">
        Rendered locally with Remotion from the saved scenes, using the same composition as the preview. The CTA PNG
        uses the static, fully-entered layout shown in the Scene Editor.
        {demoMode && " Demo Mode: exports are kept in a temporary folder on this machine and expire after a few hours."}
      </p>
    </div>
  );
}
