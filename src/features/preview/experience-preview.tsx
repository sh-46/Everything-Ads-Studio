"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "cn";
import { brandFontsFromAssets, type Asset } from "@/domain/asset";
import type { Scene, SceneDocument, SceneKind } from "@/domain/scene";
import { useBrandFonts } from "@/features/fonts/use-brand-fonts";
import { ScenePlayer } from "./scene-player";

interface ExperienceItem {
  key: string;
  label: string;
  documents: SceneDocument[];
  /** Square feed post vs. full-screen story-style scene. */
  feed: boolean;
}

const STORY_ORDER: SceneKind[] = ["intro", "exterior", "interior", "performance"];

/**
 * The Everything Ads sequence: Square Feed → Intro → Exterior → Interior →
 * Performance → Outro + CTA (stacked as one 1080×1920 view, still two scenes).
 */
export function buildExperience(scenes: Scene[]): ExperienceItem[] {
  const byKind = (kind: SceneKind) => scenes.filter((s) => s.kind === kind);
  const items: ExperienceItem[] = [];
  for (const s of byKind("feed")) items.push({ key: s.id, label: s.name, documents: [s.document], feed: true });
  for (const kind of STORY_ORDER) {
    for (const s of byKind(kind)) items.push({ key: s.id, label: s.name, documents: [s.document], feed: false });
  }
  for (const s of byKind("custom")) items.push({ key: s.id, label: s.name, documents: [s.document], feed: false });
  const outros = byKind("outro");
  const ctas = byKind("cta");
  outros.forEach((outro, i) => {
    const cta = ctas[i];
    items.push({
      key: outro.id,
      label: cta ? `${outro.name} + ${cta.name}` : outro.name,
      documents: cta ? [outro.document, cta.document] : [outro.document],
      feed: false,
    });
  });
  for (const cta of ctas.slice(outros.length)) {
    items.push({ key: cta.id, label: cta.name, documents: [cta.document], feed: false });
  }
  return items;
}

function ExperienceScene({
  item,
  assets,
  active,
  brandName,
}: {
  item: ExperienceItem;
  assets: Asset[];
  active: boolean;
  brandName: string;
}) {
  const width = Math.max(...item.documents.map((d) => d.width));
  const height = item.documents.reduce((sum, d) => sum + d.height, 0);
  const source = item.documents.length === 1 ? { document: item.documents[0] } : { documents: item.documents };
  return (
    <div className="bg-black">
      {item.feed && (
        <div className="flex items-center gap-2 bg-white px-3 py-2 text-[11px] text-neutral-900">
          <span className="size-6 rounded-full bg-neutral-200" aria-hidden />
          <span className="leading-tight">
            <span className="block font-semibold">{brandName}</span>
            <span className="block text-neutral-500">Sponsored</span>
          </span>
        </div>
      )}
      <div style={{ aspectRatio: `${width} / ${height}` }}>
        <ScenePlayer {...source} assets={assets} controls={false} loop playing={active} />
      </div>
      {item.feed && (
        <div className="bg-white px-3 py-2 text-[11px] text-neutral-500">Feed post · tap to open the experience</div>
      )}
    </div>
  );
}

/** Phone mockup: a vertically scrolling sequence; the scene in view plays its animation. */
function FullExperience({ items, assets, brandName }: { items: ExperienceItem[]; assets: Asset[]; brandName: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const [activeKey, setActiveKey] = useState(items[0]?.key ?? "");

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const key = visible[0]?.target.getAttribute("data-key");
        if (key) setActiveKey(key);
      },
      { root, threshold: [0.55, 0.8] },
    );
    itemRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  const jump = (key: string) => itemRefs.current.get(key)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="flex flex-wrap items-start gap-10">
      <div
        className="relative shrink-0 rounded-[48px] border-[10px] border-neutral-900 bg-neutral-900 shadow-2xl"
        style={{ width: 390, height: 800 }}
        aria-label="Phone mockup"
      >
        <div className="absolute top-2 left-1/2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-black" aria-hidden />
        <div
          ref={scrollRef}
          className="h-full snap-y snap-mandatory scroll-pt-8 [scrollbar-width:none] overflow-y-auto rounded-[38px] bg-black pt-8"
          data-testid="experience-scroll"
        >
          {items.map((item) => (
            <div
              key={item.key}
              data-key={item.key}
              ref={(el) => {
                if (el) itemRefs.current.set(item.key, el);
                else itemRefs.current.delete(item.key);
              }}
              className="snap-start"
            >
              <ExperienceScene item={item} assets={assets} active={activeKey === item.key} brandName={brandName} />
            </div>
          ))}
        </div>
      </div>
      <nav aria-label="Experience scenes" className="min-w-48">
        <p className="text-muted-foreground mb-2 text-xs">Scroll inside the phone, or jump to a scene:</p>
        <ol className="space-y-1">
          {items.map((item, i) => (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => jump(item.key)}
                className={cn(
                  "w-full rounded-md px-2 py-1.5 text-left text-sm",
                  activeKey === item.key ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="tabular-nums">{i + 1}.</span> {item.label}
              </button>
            </li>
          ))}
        </ol>
        <p className="text-muted-foreground mt-6 max-w-xs text-xs leading-relaxed">
          Internal creative simulation of the multi-scene experience — not the Meta Ads runtime. Outro and CTA are shown
          together as one 1080×1920 view but remain separate scenes.
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
}: {
  scenes: Scene[];
  assets: Asset[];
  brandName: string;
}) {
  const [mode, setMode] = useState<"experience" | "scene">("experience");
  const items = useMemo(() => buildExperience(scenes), [scenes]);
  useBrandFonts(useMemo(() => brandFontsFromAssets(assets), [assets]));

  return (
    <div>
      <div className="bg-muted mb-6 inline-flex rounded-md p-0.5" role="tablist" aria-label="Preview mode">
        {(
          [
            { value: "experience", label: "Full experience" },
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
      {mode === "experience" ? (
        <FullExperience items={items} assets={assets} brandName={brandName} />
      ) : (
        <SceneByScene scenes={scenes} assets={assets} />
      )}
    </div>
  );
}
