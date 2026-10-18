import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { PROJECT_STATUS_LABELS } from "@/domain/project";
import type { ProjectListItem } from "../queries";

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function ProjectCard({ project, showBrand = true }: { project: ProjectListItem; showBrand?: boolean }) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className="group border-border hover:border-foreground/20 hover:bg-muted/40 block rounded-xl border p-4 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {showBrand && (
            <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">{project.brandName}</p>
          )}
          <h3 className="mt-0.5 truncate text-sm font-semibold">{project.name}</h3>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {project.modelYear} {project.modelName}
          </p>
        </div>
        <Badge variant={project.status === "approved" ? "default" : "secondary"} className="shrink-0">
          {project.archivedAt ? "Archived" : PROJECT_STATUS_LABELS[project.status]}
        </Badge>
      </div>
      <p className="text-muted-foreground mt-4 text-[11px]">
        Edited <time dateTime={project.lastEditedAt}>{dateFormat.format(new Date(project.lastEditedAt))}</time>
      </p>
    </Link>
  );
}
