import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/** Honest status for features that are planned but not built; controls stay disabled. */
export function NotYetAvailable({
  phase,
  summary,
  items,
}: {
  phase: string;
  summary: string;
  items: { label: string; control: string }[];
}) {
  return (
    <div className="border-border rounded-xl border">
      <div className="border-border flex items-center gap-3 border-b px-5 py-4">
        <Badge variant="secondary">{phase}</Badge>
        <p className="text-muted-foreground text-sm">{summary}</p>
      </div>
      <ul className="divide-border divide-y">
        {items.map((item) => (
          <li key={item.label} className="flex items-center justify-between gap-4 px-5 py-3">
            <span className="text-sm">{item.label}</span>
            <Button size="sm" variant="outline" disabled aria-disabled title="Not available yet">
              {item.control}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
