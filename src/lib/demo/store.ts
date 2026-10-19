import "server-only";

import {
  documentUsesAsset,
  type Asset,
  type AssetMetadata,
  type AssetMetaUpdate,
  type AssetUsage,
} from "@/domain/asset";
import { brandKitSchema, defaultBrandKit, type BrandKit } from "@/domain/brand-kit";
import { defaultExportConfig } from "@/domain/export-config";
import type { MotionPreset } from "@/domain/motion-presets";
import type { ProjectMetaInput, ProjectStatus } from "@/domain/project";
import type { ImageLayer, Scene, SceneDocument, SceneKind, TextLayer } from "@/domain/scene";
import { defaultProjectScenes } from "@/domain/scene-templates";
import type { BrandDetail, BrandSummary } from "@/features/brands/queries";
import type { ProjectFilters, ProjectListItem } from "@/features/projects/queries";
import { acuraSamplePhotos, hondaSamplePhotos, sampleLogo, type SamplePhoto } from "./sample-photos";

/**
 * In-memory data for Demo Mode. Lives in the dev server process (survives hot reload,
 * resets on restart). Contains only generated sample data — never user or OEM data.
 */

export const DEMO_WORKSPACE_ID = "d0000000-0000-4000-8000-000000000000";
export const DEMO_IDS = {
  acura: "d0000000-0000-4000-8000-0000000000a1",
  honda: "d0000000-0000-4000-8000-0000000000b1",
  mdx: "d0000000-0000-4000-8000-0000000001a1",
  pilot: "d0000000-0000-4000-8000-0000000001b1",
} as const;

interface BrandRecord {
  id: string;
  name: string;
  archivedAt: string | null;
  updatedAt: string;
  kit: BrandKit;
  kitRevision: number;
}

interface AssetRecord {
  asset: Asset;
  brandId: string;
  bytes?: Uint8Array;
  /** Bumped when the file is replaced, so URLs (and image caches) change. */
  version?: number;
}

interface DemoDb {
  brands: Map<string, BrandRecord>;
  projects: Map<string, Omit<ProjectListItem, "brandName">>;
  scenes: Map<string, Scene>;
  assets: Map<string, AssetRecord>;
}

const SAMPLE_NOTE = "Sample copy — not approved OEM messaging";

const MDX_COPY: Partial<
  Record<SceneKind, { headline: string; subtitle: string; photo: string; secondPhoto?: string }>
> = {
  intro: { headline: "The 2026 MDX", subtitle: SAMPLE_NOTE, photo: "vertical-hero" },
  exterior: { headline: "Presence, from every angle", subtitle: SAMPLE_NOTE, photo: "exterior-front" },
  interior: { headline: "Every detail, considered", subtitle: SAMPLE_NOTE, photo: "interior" },
  performance: { headline: "Built to respond", subtitle: SAMPLE_NOTE, photo: "performance" },
  outro: { headline: "Make it yours", subtitle: SAMPLE_NOTE, photo: "exterior-side" },
  feed: { headline: "The 2026 MDX", subtitle: SAMPLE_NOTE, photo: "exterior-front" },
};

function now(offsetMinutes = 0): string {
  return new Date(Date.now() - offsetMinutes * 60_000).toISOString();
}

function acuraKit(): BrandKit {
  const kit = defaultBrandKit();
  kit.colors = { ...kit.colors, background: "#0B0B0C", accent: "#C8102E" };
  kit.typography.headline = { ...kit.typography.headline, fontSize: 92, fontWeight: 700, letterSpacing: -1.5 };
  return brandKitSchema.parse(kit);
}

function hondaKit(): BrandKit {
  const kit = defaultBrandKit();
  kit.colors = { background: "#F2F4F7", primary: "#0F1B2D", accent: "#1F5FAD", text: "#0F1B2D", palette: [] };
  const font = "Avenir Next";
  kit.typography = {
    headline: { fontFamily: font, fontSize: 84, fontWeight: 600, letterSpacing: 0, lineHeight: 1.1, color: "#0F1B2D" },
    subtitle: { fontFamily: font, fontSize: 38, fontWeight: 400, letterSpacing: 0, lineHeight: 1.3, color: "#3B4A5E" },
    body: { fontFamily: font, fontSize: 30, fontWeight: 400, letterSpacing: 0, lineHeight: 1.4, color: "#3B4A5E" },
    cta: { fontFamily: font, fontSize: 42, fontWeight: 600, letterSpacing: 0.5, lineHeight: 1, color: "#FFFFFF" },
  };
  kit.scrim = {
    gradientType: "linear",
    angle: 180,
    stops: [
      { offset: 0, color: "#F2F4F7", opacity: 0 },
      { offset: 1, color: "#F2F4F7", opacity: 0.95 },
    ],
  };
  kit.cta = { label: "Learn More", background: "#1F5FAD", textColor: "#FFFFFF", cornerRadius: 64 };
  return brandKitSchema.parse(kit);
}

function addPhotos(db: DemoDb, brandId: string, projectId: string, photos: SamplePhoto[]): Map<string, string> {
  const idsByKey = new Map<string, string>();
  photos.forEach((p, i) => {
    const id = crypto.randomUUID();
    idsByKey.set(p.key, id);
    db.assets.set(id, {
      brandId,
      asset: {
        id,
        kind: "photo",
        url: p.dataUrl,
        width: p.width,
        height: p.height,
        originalFilename: p.filename,
        mimeType: "image/svg+xml",
        projectId,
        createdAt: now(600 + i),
        displayName: null,
        metadata: {},
      },
    });
  });
  return idsByKey;
}

function addSampleLogo(db: DemoDb, brandId: string, logo: SamplePhoto) {
  const id = crypto.randomUUID();
  db.assets.set(id, {
    brandId,
    asset: {
      id,
      kind: "logo",
      url: logo.dataUrl,
      width: logo.width,
      height: logo.height,
      originalFilename: logo.filename,
      mimeType: "image/svg+xml",
      projectId: null,
      createdAt: now(900),
      displayName: "Sample wordmark",
      metadata: { variant: "Primary" },
    },
  });
}

function addProject(
  db: DemoDb,
  input: {
    id: string;
    brandId: string;
    name: string;
    modelYear: number;
    modelName: string;
    status: ProjectStatus;
    editedMinutesAgo: number;
  },
  kit: BrandKit,
  fill?: (kind: SceneKind, doc: SceneDocument) => SceneDocument,
) {
  db.projects.set(input.id, {
    id: input.id,
    workspaceId: DEMO_WORKSPACE_ID,
    brandId: input.brandId,
    name: input.name,
    modelYear: input.modelYear,
    modelName: input.modelName,
    status: input.status,
    exportConfig: defaultExportConfig(),
    motionPresets: [],
    revision: 1,
    lastEditedAt: now(input.editedMinutesAgo),
    archivedAt: null,
    createdAt: now(input.editedMinutesAgo + 60),
  });
  defaultProjectScenes(kit).forEach((template, position) => {
    const id = crypto.randomUUID();
    db.scenes.set(id, {
      id,
      projectId: input.id,
      name: template.name,
      kind: template.kind,
      position,
      revision: 1,
      document: fill ? fill(template.kind, template.document) : template.document,
      updatedAt: now(input.editedMinutesAgo),
    });
  });
}

function seed(): DemoDb {
  const db: DemoDb = { brands: new Map(), projects: new Map(), scenes: new Map(), assets: new Map() };
  const acura = acuraKit();
  const honda = hondaKit();
  db.brands.set(DEMO_IDS.acura, {
    id: DEMO_IDS.acura,
    name: "Acura (Sample)",
    archivedAt: null,
    updatedAt: now(30),
    kit: acura,
    kitRevision: 1,
  });
  db.brands.set(DEMO_IDS.honda, {
    id: DEMO_IDS.honda,
    name: "Honda (Sample)",
    archivedAt: null,
    updatedAt: now(300),
    kit: honda,
    kitRevision: 1,
  });

  addSampleLogo(db, DEMO_IDS.acura, sampleLogo("ACURA", "#FFFFFF"));
  addSampleLogo(db, DEMO_IDS.honda, sampleLogo("HONDA", "#0F1B2D"));

  const mdxPhotos = addPhotos(db, DEMO_IDS.acura, DEMO_IDS.mdx, acuraSamplePhotos());
  addProject(
    db,
    {
      id: DEMO_IDS.mdx,
      brandId: DEMO_IDS.acura,
      name: "2026 Acura MDX — Sample",
      modelYear: 2026,
      modelName: "MDX",
      status: "draft",
      editedMinutesAgo: 12,
    },
    acura,
    (kind, doc) => {
      const copy = MDX_COPY[kind];
      if (!copy) return doc;
      return {
        ...doc,
        layers: doc.layers.map((layer) => {
          if (layer.role === "primaryImage")
            return { ...layer, assetId: mdxPhotos.get(copy.photo) ?? null } as ImageLayer;
          if (layer.role === "headline") return { ...layer, text: copy.headline } as TextLayer;
          if (layer.role === "subtitle") return { ...layer, text: copy.subtitle } as TextLayer;
          return layer;
        }),
      };
    },
  );

  const pilotPhotos = addPhotos(db, DEMO_IDS.honda, DEMO_IDS.pilot, hondaSamplePhotos());
  addProject(
    db,
    {
      id: DEMO_IDS.pilot,
      brandId: DEMO_IDS.honda,
      name: "2026 Honda Pilot — Sample",
      modelYear: 2026,
      modelName: "Pilot",
      status: "in_review",
      editedMinutesAgo: 240,
    },
    honda,
    (_kind, doc) => ({
      ...doc,
      layers: doc.layers.map((layer) =>
        layer.role === "primaryImage"
          ? ({ ...layer, assetId: pilotPhotos.get("exterior") ?? null } as ImageLayer)
          : layer,
      ),
    }),
  );
  return db;
}

// Versioned so a dev server running older code reseeds instead of reusing a stale shape.
const globalKey = "__everythingAdsDemoStore_v4" as const;
type GlobalWithDemo = typeof globalThis & { [globalKey]?: DemoDb };

function db(): DemoDb {
  const g = globalThis as GlobalWithDemo;
  g[globalKey] ??= seed();
  return g[globalKey];
}

/** Callers get copies so nothing outside this module mutates the store by accident. */
const copy = <T>(value: T): T => structuredClone(value);

// ---------------------------------------------------------------------------- brands

export function demoListBrands({ includeArchived = false } = {}): BrandSummary[] {
  const { brands, projects } = db();
  return [...brands.values()]
    .filter((b) => includeArchived || !b.archivedAt)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((b) => ({
      id: b.id,
      name: b.name,
      archivedAt: b.archivedAt,
      updatedAt: b.updatedAt,
      projectCount: [...projects.values()].filter((p) => p.brandId === b.id && !p.archivedAt).length,
    }));
}

export function demoGetBrand(brandId: string): BrandDetail | null {
  const b = db().brands.get(brandId);
  return b ? copy({ id: b.id, name: b.name, archivedAt: b.archivedAt, kit: b.kit, kitRevision: b.kitRevision }) : null;
}

export function demoCreateBrand(name: string): string {
  const id = crypto.randomUUID();
  db().brands.set(id, { id, name, archivedAt: null, updatedAt: now(), kit: defaultBrandKit(), kitRevision: 1 });
  return id;
}

export function demoUpdateBrand(brandId: string, patch: { name?: string; archived?: boolean }): boolean {
  const b = db().brands.get(brandId);
  if (!b) return false;
  if (patch.name !== undefined) b.name = patch.name;
  if (patch.archived !== undefined) b.archivedAt = patch.archived ? now() : null;
  b.updatedAt = now();
  return true;
}

export function demoUpdateBrandKit(
  brandId: string,
  expectedRevision: number,
  kit: BrandKit,
): number | "conflict" | null {
  const b = db().brands.get(brandId);
  if (!b) return null;
  if (b.kitRevision !== expectedRevision) return "conflict";
  b.kit = copy(kit);
  b.kitRevision += 1;
  b.updatedAt = now();
  return b.kitRevision;
}

// -------------------------------------------------------------------------- projects

function withBrandName(p: Omit<ProjectListItem, "brandName">): ProjectListItem {
  return copy({ ...p, brandName: db().brands.get(p.brandId)?.name ?? "Unknown brand" });
}

export function demoListProjects(filters: ProjectFilters = {}): ProjectListItem[] {
  const term = filters.search?.trim().toLowerCase();
  return [...db().projects.values()]
    .filter((p) => filters.includeArchived || !p.archivedAt)
    .filter((p) => !filters.brandId || p.brandId === filters.brandId)
    .filter((p) => !term || p.name.toLowerCase().includes(term) || p.modelName.toLowerCase().includes(term))
    .sort((a, b) => b.lastEditedAt.localeCompare(a.lastEditedAt))
    .slice(0, filters.limit ?? 100)
    .map(withBrandName);
}

export function demoGetProject(projectId: string): ProjectListItem | null {
  const p = db().projects.get(projectId);
  return p ? withBrandName(p) : null;
}

export function demoCreateProject(brandId: string, meta: ProjectMetaInput): string | null {
  const brand = db().brands.get(brandId);
  if (!brand) return null;
  const id = crypto.randomUUID();
  addProject(db(), { id, brandId, ...meta, status: "draft", editedMinutesAgo: 0 }, brand.kit);
  return id;
}

export function demoUpdateProject(
  projectId: string,
  patch: Partial<ProjectMetaInput> & { status?: ProjectStatus; archived?: boolean },
): boolean {
  const p = db().projects.get(projectId);
  if (!p) return false;
  const { archived, ...rest } = patch;
  Object.assign(p, rest);
  if (archived !== undefined) p.archivedAt = archived ? now() : null;
  p.lastEditedAt = now();
  return true;
}

export function demoDuplicateProject(projectId: string, name: string): string | null {
  const store = db();
  const source = store.projects.get(projectId);
  if (!source) return null;
  const id = crypto.randomUUID();
  store.projects.set(id, {
    ...copy(source),
    id,
    name,
    status: "draft",
    archivedAt: null,
    lastEditedAt: now(),
    createdAt: now(),
  });
  for (const scene of [...store.scenes.values()].filter((s) => s.projectId === projectId)) {
    const sceneId = crypto.randomUUID();
    store.scenes.set(sceneId, { ...copy(scene), id: sceneId, projectId: id, revision: 1, updatedAt: now() });
  }
  return id;
}

// ---------------------------------------------------------------------------- scenes

export function demoListScenes(projectId: string): Scene[] {
  return copy(
    [...db().scenes.values()].filter((s) => s.projectId === projectId).sort((a, b) => a.position - b.position),
  );
}

export function demoSaveScene(input: {
  sceneId: string;
  expectedRevision: number;
  name: string;
  document: SceneDocument;
}): { status: "saved"; revision: number; updatedAt: string } | { status: "conflict"; current: Scene } | null {
  const store = db();
  const scene = store.scenes.get(input.sceneId);
  if (!scene) return null;
  if (scene.revision !== input.expectedRevision) return { status: "conflict", current: copy(scene) };
  scene.name = input.name;
  scene.document = copy(input.document);
  scene.revision += 1;
  scene.updatedAt = now();
  const project = store.projects.get(scene.projectId);
  if (project) project.lastEditedAt = scene.updatedAt;
  return { status: "saved", revision: scene.revision, updatedAt: scene.updatedAt };
}

// ---------------------------------------------------------------------------- assets

function assetUrl(id: string, version: number): string {
  return `/api/demo/assets/${id}?v=${version}`;
}

/** Project photos plus any other assets its scenes reference (e.g. after duplication). */
export function demoListProjectPhotos(projectId: string, referencedIds: Iterable<string> = []): Asset[] {
  const extra = new Set(referencedIds);
  return copy(
    [...db().assets.values()]
      .map((a) => a.asset)
      .filter((a) => a.kind === "photo" && (a.projectId === projectId || extra.has(a.id)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );
}

/** Logos and fonts of one brand's Brand Kit. */
export function demoListBrandKitAssets(brandId: string): Asset[] {
  return copy(
    [...db().assets.values()]
      .filter((a) => a.brandId === brandId && a.asset.kind !== "photo")
      .map((a) => a.asset)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  );
}

export function demoGetAsset(assetId: string): (Asset & { brandId: string }) | null {
  const record = db().assets.get(assetId);
  return record ? copy({ ...record.asset, brandId: record.brandId }) : null;
}

export interface DemoFileInput {
  bytes: Uint8Array;
  mimeType: string;
  width: number | null;
  height: number | null;
  originalFilename: string;
}

export function demoAddAsset(
  input: DemoFileInput & {
    kind: Asset["kind"];
    brandId: string;
    projectId: string | null;
    displayName: string | null;
    metadata: AssetMetadata;
  },
): Asset | null {
  const store = db();
  if (!store.brands.has(input.brandId)) return null;
  if (input.projectId && store.projects.get(input.projectId)?.brandId !== input.brandId) return null;
  const id = crypto.randomUUID();
  const asset: Asset = {
    id,
    kind: input.kind,
    url: assetUrl(id, 1),
    width: input.width,
    height: input.height,
    originalFilename: input.originalFilename,
    mimeType: input.mimeType,
    projectId: input.projectId,
    createdAt: now(),
    displayName: input.displayName,
    metadata: input.metadata,
  };
  store.assets.set(id, { asset, brandId: input.brandId, bytes: input.bytes, version: 1 });
  return copy(asset);
}

export function demoReplaceAssetFile(assetId: string, file: DemoFileInput): Asset | null {
  const record = db().assets.get(assetId);
  if (!record) return null;
  record.version = (record.version ?? 1) + 1;
  record.bytes = file.bytes;
  record.asset = {
    ...record.asset,
    mimeType: file.mimeType,
    width: file.width,
    height: file.height,
    originalFilename: file.originalFilename,
    url: assetUrl(assetId, record.version),
  };
  return copy(record.asset);
}

export function demoUpdateAssetMeta(assetId: string, update: AssetMetaUpdate): Asset | null {
  const record = db().assets.get(assetId);
  if (!record) return null;
  if (update.displayName !== undefined) record.asset.displayName = update.displayName;
  if (update.metadata) record.asset.metadata = { ...record.asset.metadata, ...update.metadata };
  return copy(record.asset);
}

export function demoAssetUsage(assetId: string): AssetUsage[] {
  const store = db();
  const record = store.assets.get(assetId);
  if (!record) return [];
  const usage: AssetUsage[] = [];
  for (const project of [...store.projects.values()].filter((p) => p.brandId === record.brandId)) {
    for (const scene of [...store.scenes.values()]
      .filter((s) => s.projectId === project.id)
      .sort((a, b) => a.position - b.position)) {
      if (documentUsesAsset(scene.document, record.asset)) {
        usage.push({ projectId: project.id, projectName: project.name, sceneId: scene.id, sceneName: scene.name });
      }
    }
  }
  return usage;
}

export function demoDeleteAsset(assetId: string): boolean {
  return db().assets.delete(assetId);
}

export function demoGetAssetFile(assetId: string): { bytes: Uint8Array; mimeType: string } | null {
  const record = db().assets.get(assetId);
  return record?.bytes ? { bytes: record.bytes, mimeType: record.asset.mimeType } : null;
}

// ------------------------------------------------------------- scene-level operations

export function demoGetSceneWithBrand(sceneId: string): { scene: Scene; kit: BrandKit; brandId: string } | null {
  const store = db();
  const scene = store.scenes.get(sceneId);
  const project = scene && store.projects.get(scene.projectId);
  const brand = project && store.brands.get(project.brandId);
  return scene && brand ? copy({ scene, kit: brand.kit, brandId: brand.id }) : null;
}

export function demoDuplicateScene(sourceSceneId: string, name: string, document: SceneDocument): Scene | null {
  const store = db();
  const source = store.scenes.get(sourceSceneId);
  if (!source) return null;
  const position =
    Math.max(...[...store.scenes.values()].filter((s) => s.projectId === source.projectId).map((s) => s.position)) + 1;
  const scene: Scene = {
    id: crypto.randomUUID(),
    projectId: source.projectId,
    name,
    kind: source.kind,
    position,
    revision: 1,
    document: copy(document),
    updatedAt: now(),
  };
  store.scenes.set(scene.id, scene);
  return copy(scene);
}

// ----------------------------------------------------------------- motion presets

export function demoSaveMotionPreset(projectId: string, preset: MotionPreset): MotionPreset[] | null {
  const project = db().projects.get(projectId);
  if (!project) return null;
  project.motionPresets = [...project.motionPresets.filter((p) => p.id !== preset.id), copy(preset)];
  return copy(project.motionPresets);
}

export function demoDeleteMotionPreset(projectId: string, presetId: string): MotionPreset[] | null {
  const project = db().projects.get(projectId);
  if (!project) return null;
  project.motionPresets = project.motionPresets.filter((p) => p.id !== presetId);
  return copy(project.motionPresets);
}
