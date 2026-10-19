"use client";

import { ChevronLeft } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "cn";
import { brandFontsFromAssets, type Asset } from "@/domain/asset";
import type { Scene, SceneDocument, SceneKind } from "@/domain/scene";
import { useBrandFonts } from "@/features/fonts/use-brand-fonts";
import { ScenePlayer } from "./scene-player";

/**
 * Facebook Experience Preview — an internal simulation of how the creative package is
 * seen on a phone: the Motion Tile in a feed, then Learn More opens the Facebook Build.
 * Nothing here (phone frame, feed, buttons) is part of any export.
 */

interface BuildItem {
  key: string;
  label: string;
  documents: SceneDocument[];
}

const BUILD_ORDER: SceneKind[] = ["intro", "exterior", "interior", "performance"];

/** Same scene choice as the export package: the first scene of each kind. */
export function buildFacebookBuild(scenes: Scene[]): BuildItem[] {
  const first = (kind: SceneKind) => scenes.find((s) => s.kind === kind);
  const items: BuildItem[] = [];
  for (const kind of BUILD_ORDER) {
    const scene = first(kind);
    if (scene) items.push({ key: scene.id, label: scene.name, documents: [scene.document] });
  }
  const outro = first("outro");
  const cta = first("cta");
  if (outro || cta) {
    items.push({
      key: (outro ?? cta)!.id,
      label: outro && cta ? `${outro.name} + ${cta.name}` : (outro ?? cta)!.name,
      documents: [outro, cta].filter((s): s is Scene => Boolean(s)).map((s) => s.document),
    });
  }
  return items;
}

/** Key of the child (with data-key) most visible inside a scroll container. */
function useMostVisible(root: React.RefObject<HTMLDivElement | null>, deps: unknown[]) {
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ratios = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) ratios.set(e.target.getAttribute("data-key") ?? "", e.intersectionRatio);
        const best = [...ratios].sort((a, b) => b[1] - a[1])[0];
        if (best && best[1] > 0.4) setKey(best[0]);
      },
      { root: el, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    el.querySelectorAll("[data-key]").forEach((child) => observer.observe(child));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return key;
}

function MotionScene({
  documents,
  assets,
  playing,
}: {
  documents: SceneDocument[];
  assets: Asset[];
  playing: boolean;
}) {
  const width = Math.max(...documents.map((d) => d.width));
  const height = documents.reduce((sum, d) => sum + d.height, 0);
  const source = documents.length === 1 ? { document: documents[0] } : { documents };
  return (
    <div style={{ aspectRatio: `${width} / ${height}` }}>
      <ScenePlayer {...source} assets={assets} controls={false} loop playing={playing} />
    </div>
  );
}

function PlaceholderPost() {
  return (
    <div className="border-b-8 border-neutral-100 bg-white p-3" aria-hidden>
      <div className="flex items-center gap-2">
        <span className="size-8 rounded-full bg-neutral-200" />
        <span className="space-y-1">
          <span className="block h-2 w-24 rounded bg-neutral-200" />
          <span className="block h-2 w-14 rounded bg-neutral-100" />
        </span>
      </div>
      <div className="mt-3 space-y-1.5">
        <span className="block h-2 w-full rounded bg-neutral-100" />
        <span className="block h-2 w-2/3 rounded bg-neutral-100" />
      </div>
      <div className="mt-3 aspect-[4/3] rounded bg-neutral-100" />
    </div>
  );
}

function FeedView({
  tile,
  assets,
  brandName,
  projectName,
  active,
  onLearnMore,
  scrollRef,
}: {
  tile: Scene | undefined;
  assets: Asset[];
  brandName: string;
  projectName: string;
  active: boolean;
  onLearnMore: () => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={scrollRef}
      className={cn("h-full [scrollbar-width:none] overflow-y-auto bg-neutral-100", !active && "hidden")}
      data-testid="fb-feed"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between bg-white px-3 pt-9 pb-2">
        <span className="text-lg font-bold text-[#1877f2]">Feed</span>
        <span className="flex gap-2" aria-hidden>
          <span className="size-7 rounded-full bg-neutral-100" />
          <span className="size-7 rounded-full bg-neutral-100" />
        </span>
      </div>
      <div className="mb-2 flex gap-2 overflow-hidden bg-white px-3 pb-3" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <span key={i} className="h-24 w-16 shrink-0 rounded-lg bg-neutral-200" />
        ))}
      </div>
      <PlaceholderPost />
      <article className="mb-2 bg-white text-neutral-900" data-testid="fb-sponsored-post">
        <header className="flex items-center gap-2 px-3 py-2">
          <span
            className="flex size-9 items-center justify-center rounded-full bg-neutral-900 text-xs font-bold text-white"
            aria-hidden
          >
            {brandName.slice(0, 1).toUpperCase()}
          </span>
          <span className="leading-tight">
            <span className="block text-[13px] font-semibold">{brandName} Dealership</span>
            <span className="block text-[11px] text-neutral-500">Sponsored</span>
          </span>
        </header>
        <p className="px-3 pb-2 text-[13px]">Meet the {projectName}. Tap Learn More to explore.</p>
        <div data-testid="fb-motion-tile">
          {tile ? (
            <MotionScene documents={[tile.document]} assets={assets} playing={active} />
          ) : (
            <div className="flex aspect-square items-center justify-center bg-neutral-200 text-xs text-neutral-500">
              No Square Feed scene in this project
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 bg-neutral-50 px-3 py-2.5">
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[11px] text-neutral-500 uppercase">{brandName}</span>
            <span className="block truncate text-[13px] font-semibold">{projectName}</span>
          </span>
          <button
            type="button"
            onClick={onLearnMore}
            className="shrink-0 rounded-md bg-neutral-200 px-3 py-1.5 text-[13px] font-semibold hover:bg-neutral-300"
            data-testid="fb-learn-more"
          >
            Learn More
          </button>
        </div>
      </article>
      <PlaceholderPost />
      <PlaceholderPost />
    </div>
  );
}

function BuildView({
  items,
  assets,
  active,
  onBack,
  scrollRef,
  playingKey,
}: {
  items: BuildItem[];
  assets: Asset[];
  active: boolean;
  onBack: () => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  playingKey: string | null;
}) {
  return (
    <div className={cn("relative h-full bg-black", !active && "hidden")} data-testid="fb-build">
      <button
        type="button"
        onClick={onBack}
        className="absolute top-8 left-2 z-10 flex items-center gap-0.5 rounded-full bg-black/60 py-1 pr-3 pl-1.5 text-[13px] font-medium text-white backdrop-blur"
        data-testid="fb-back"
      >
        <ChevronLeft className="size-4" aria-hidden /> Back
      </button>
      <div
        ref={scrollRef}
        className="h-full snap-y snap-mandatory [scrollbar-width:none] overflow-y-auto"
        data-testid="experience-scroll"
      >
        {items.map((item) => (
          <div
            key={item.key}
            data-key={item.key}
            data-label={item.label}
            data-playing={active && playingKey === item.key}
            className="snap-start"
            data-testid="fb-build-scene"
          >
            <MotionScene documents={item.documents} assets={assets} playing={active && playingKey === item.key} />
          </div>
        ))}
        {items.length === 0 && (
          <p className="p-6 pt-20 text-center text-xs text-neutral-400">
            This project has no Facebook Build scenes yet.
          </p>
        )}
      </div>
    </div>
  );
}

function FacebookPreview({
  scenes,
  assets,
  brandName,
  projectName,
}: {
  scenes: Scene[];
  assets: Asset[];
  brandName: string;
  projectName: string;
}) {
  const tile = scenes.find((s) => s.kind === "feed");
  const items = useMemo(() => buildFacebookBuild(scenes), [scenes]);
  const [view, setView] = useState<"feed" | "build">("feed");
  const feedRef = useRef<HTMLDivElement>(null);
  const buildRef = useRef<HTMLDivElement>(null);
  const feedScroll = useRef(0);
  const visible = useMostVisible(buildRef, [items, view]);
  const playingKey = visible ?? items[0]?.key ?? null;

  const openBuild = () => {
    feedScroll.current = feedRef.current?.scrollTop ?? 0;
    setView("build");
  };
  const back = () => setView("feed");

  // Learn More always starts at the Intro; Back returns to the same place in the feed.
  useEffect(() => {
    if (view === "build" && buildRef.current) buildRef.current.scrollTop = 0;
    if (view === "feed" && feedRef.current) feedRef.current.scrollTop = feedScroll.current;
  }, [view]);

  const jump = (key: string) => {
    if (view !== "build") openBuild();
    requestAnimationFrame(() =>
      buildRef.current?.querySelector(`[data-key="${key}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  return (
    <div className="flex flex-wrap items-start gap-10">
      <div
        className="relative shrink-0 overflow-hidden rounded-[48px] border-[10px] border-neutral-900 bg-neutral-900 shadow-2xl"
        style={{ width: 390, height: 800 }}
        aria-label="Phone mockup"
        data-testid="fb-phone"
        data-view={view}
      >
        <div className="absolute top-2 left-1/2 z-20 h-5 w-24 -translate-x-1/2 rounded-full bg-black" aria-hidden />
        <div className="h-full overflow-hidden rounded-[38px]">
          <FeedView
            tile={tile}
            assets={assets}
            brandName={brandName}
            projectName={projectName}
            active={view === "feed"}
            onLearnMore={openBuild}
            scrollRef={feedRef}
          />
          <BuildView
            items={items}
            assets={assets}
            active={view === "build"}
            onBack={back}
            scrollRef={buildRef}
            playingKey={playingKey}
          />
        </div>
      </div>
      <nav aria-label="Experience" className="min-w-48">
        <p className="text-muted-foreground mb-2 text-xs">Tap Learn More in the phone, or jump to:</p>
        <ol className="space-y-1">
          <li>
            <button
              type="button"
              onClick={back}
              className={cn(
                "w-full rounded-md px-2 py-1.5 text-left text-sm",
                view === "feed" ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Feed · Motion Tile
            </button>
          </li>
          {items.map((item, i) => (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => jump(item.key)}
                className={cn(
                  "w-full rounded-md px-2 py-1.5 text-left text-sm",
                  view === "build" && playingKey === item.key
                    ? "bg-muted font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="tabular-nums">{i + 1}.</span> {item.label}
              </button>
            </li>
          ))}
        </ol>
        <p className="text-muted-foreground mt-6 max-w-xs text-xs leading-relaxed">
          Internal simulation only — not the Meta Ads runtime, and none of it appears in exports. Outro and CTA are
          shown stacked but export as separate files.
        </p>
      </nav>
    </div>
  );
}

function SceneByScene({ scenes, assets }: { scenes: Scene[]; assets: Asset[] }) {
  const [selectedId, setSelectedId] = useState(scenes[0]?.id ?? "");
  const scene = scenes.find((s) => s.id === selectedId) ?? scenes[0];
  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <ol className="space-y-1" aria-label="Scenes">
        {scenes.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => setSelectedId(s.id)}
              className={cn(
                "w-full rounded-md px-2 py-1.5 text-left text-sm",
                s.id === scene?.id ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="tabular-nums">{i + 1}.</span> {s.name}
              <span className="text-muted-foreground block text-[11px] tabular-nums">
                {s.document.width}×{s.document.height}
              </span>
            </button>
          </li>
        ))}
      </ol>
      {scene && (
        <div className="h-[72vh] min-h-96">
          <ScenePlayer key={scene.id} document={scene.document} assets={assets} autoPlay />
        </div>
      )}
    </div>
  );
}

export function ExperiencePreview({
  scenes,
  assets,
  brandName,
  projectName,
}: {
  scenes: Scene[];
  assets: Asset[];
  brandName: string;
  projectName: string;
}) {
  const [mode, setMode] = useState<"facebook" | "scene">("facebook");
  useBrandFonts(useMemo(() => brandFontsFromAssets(assets), [assets]));

  return (
    <div>
      <div className="bg-muted mb-6 inline-flex rounded-md p-0.5" role="tablist" aria-label="Preview mode">
        {(
          [
            { value: "facebook", label: "Facebook mobile preview" },
            { value: "scene", label: "Scene preview" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.value}
            role="tab"
            type="button"
            aria-selected={mode === tab.value}
            onClick={() => setMode(tab.value)}
            className={cn(
              "rounded px-3 py-1 text-sm",
              mode === tab.value ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {mode === "facebook" ? (
        <FacebookPreview scenes={scenes} assets={assets} brandName={brandName} projectName={projectName} />
      ) : (
        <SceneByScene scenes={scenes} assets={assets} />
      )}
    </div>
  );
}
