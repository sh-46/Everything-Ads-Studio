/** Visible marker that the app is running on local sample data. */
export function DemoBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 ${className}`}
      title="Local Demo Mode: sample data in dev-server memory. Nothing is sent to Supabase; data resets when the dev server restarts."
    >
      <span className="size-1.5 rounded-full bg-amber-500" aria-hidden />
      Demo Mode · sample data
    </span>
  );
}
