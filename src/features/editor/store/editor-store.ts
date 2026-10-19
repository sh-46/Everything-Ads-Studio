"use client";

import { create } from "zustand";
import { requiresDisclosure, type Asset } from "@/domain/asset";
import {
  applyDisclosureDecision,
  detachDisclosures,
  disclosureLayersFor,
  ensureDisclosureLayer,
  fitDisclosureHeight,
  moveIntoSafeArea,
  planLayerRemoval,
  planPhotoChange,
  removeLayers,
  syncDisclosuresForAsset,
  type DisclosureDecision,
  type DisclosureIssue,
  type PhotoChangePlan,
} from "@/domain/disclosures";
import { fontStack } from "@/domain/fonts";
import { assignScenePhoto, photoPair, type PhotoSlot } from "@/domain/scene-photos";
import { canvasMeasure, type MeasureText } from "@/domain/text-layout";
import type { UploadTarget } from "@/features/assets/upload";
import { computeSceneTimings } from "@/domain/motion-engine";
import type { MotionPreset } from "@/domain/motion-presets";
import type { MotionConfig } from "@/domain/motion";
import type { BrandKit } from "@/domain/brand-kit";
import { applyLayoutPreset, type LayoutPresetId } from "@/domain/layout-presets";
import type { Layer, Scene, SceneDocument } from "@/domain/scene";
import * as history from "./history";
import * as ops from "./layer-ops";

export interface EditorScene extends Scene {
  /** Incremented on every local change; autosave compares it to know what's persisted. */
  editVersion: number;
  savedVersion: number;
}

export type ZoomMode = "fit" | number;

/** "edit" shows the Konva canvas; "preview" plays the scene with Remotion. */
export type CanvasMode = "edit" | "preview";

/** A photo change waiting for the user's answer about its disclosure. */
export interface PendingPhotoChange {
  sceneId: string;
  kind: "photo" | "remove";
  layerId: string;
  /** New photo for kind "photo" (null = remove the photo from the frame). */
  assetId: string | null;
  plan: PhotoChangePlan;
}

export interface SaveIssue {
  error?: string;
  conflict?: Scene;
}

interface EditorState {
  projectId: string;
  brandId: string;
  kit: BrandKit;
  assets: Asset[];
  scenes: Record<string, EditorScene>;
  sceneOrder: string[];
  activeSceneId: string;
  selectedLayerId: string | null;
  history: history.HistoryState;
  zoom: ZoomMode;
  savingSceneIds: string[];
  saveIssues: Record<string, SaveIssue>;
  lastSavedAt: number | null;
  canvasMode: CanvasMode;
  /** Image layer whose motion focus point is being placed on the canvas (crosshair). */
  focusEditLayerId: string | null;
  /** Where uploads from the editor go (project photos, brand logos). */
  uploadTarget: UploadTarget | null;
  /** Ask the preview player to (re)start playback from `fromMs` (bumping `nonce`). */
  previewRequest: { nonce: number; fromMs: number };
  /** Project-level motion presets. */
  motionPresets: MotionPreset[];
  /** Brand font load state by family, and a counter that changes as fonts finish loading. */
  fontStatus: Record<string, "loading" | "loaded" | "error">;
  fontsVersion: number;
  pendingPhotoChange: PendingPhotoChange | null;

  init(input: {
    projectId: string;
    brandId: string;
    kit: BrandKit;
    assets: Asset[];
    scenes: Scene[];
    uploadTarget: UploadTarget;
    motionPresets?: MotionPreset[];
  }): void;
  setActiveScene(sceneId: string): void;
  selectLayer(layerId: string | null): void;
  setZoom(zoom: ZoomMode): void;

  /** Every document edit goes through here so undo/redo and autosave see it. */
  mutateScene(
    sceneId: string,
    recipe: (snapshot: history.SceneSnapshot) => history.SceneSnapshot,
    coalesceKey?: string,
  ): void;
  updateLayer(layerId: string, patch: ops.LayerPatch, coalesceKey?: string): void;
  addLayer(layer: Layer): void;
  /** Deletes a layer; a photo with a disclosure asks first (see `pendingPhotoChange`). */
  removeLayer(layerId: string): void;
  /**
   * Put a photo in (or remove it from) an image frame. If its disclosure changes, the
   * user is asked first; otherwise it applies at once. One undo step either way.
   */
  changePhoto(layerId: string, assetId: string | null): void;
  /** Answer the pending question (null = cancel the change). */
  resolvePhotoChange(decision: DisclosureDecision | null): void;
  /** Assign a scene photo slot (Photo 2 transitions), adding its disclosure if required. */
  assignSlotPhoto(slot: PhotoSlot, assetId: string): void;
  /** Apply a disclosure quick fix in the active scene. */
  fixDisclosure(issue: DisclosureIssue): void;
  /** After a photo's disclosure changed in the library: update every scene using it. */
  syncAssetDisclosures(asset: Asset): { added: number; removed: number };
  duplicateLayer(layerId: string): void;
  reorderLayer(layerId: string, direction: ops.ReorderDirection): void;
  moveLayer(layerId: string, targetIndex: number): void;
  alignLayer(layerId: string, alignment: ops.SceneAlignment): void;
  updateDocument(patch: Partial<Omit<SceneDocument, "layers" | "schemaVersion">>, coalesceKey?: string): void;
  renameScene(name: string): void;
  applyLayout(presetId: LayoutPresetId): void;
  undo(): void;
  redo(): void;

  addAsset(asset: Asset): void;
  /** Replace an asset's record (new file or metadata) keeping its id. */
  updateAsset(asset: Asset): void;
  removeAsset(assetId: string): void;
  setAssets(assets: Asset[]): void;
  /** Insert a scene created on the server (e.g. a duplicate) after its source. */
  insertScene(scene: Scene, afterSceneId: string): void;
  setCanvasMode(mode: CanvasMode): void;
  setFocusEdit(layerId: string | null): void;
  /** Switch to preview and play from `fromMs` (default: scene start). */
  playPreview(fromMs?: number): void;
  /** Switch to preview and replay the given layer's animation from just before it starts. */
  playLayer(layerId: string): void;
  setMotionPresets(presets: MotionPreset[]): void;
  /** Copy motion onto every layer with `role` across all scenes (one undo step per scene). */
  applyMotionToRole(role: string, motion: (layer: { motion: MotionConfig; type: string }) => MotionConfig): number;
  setFontState(status: Record<string, "loading" | "loaded" | "error">, version: number): void;

  markSaving(sceneId: string, saving: boolean): void;
  markSaved(sceneId: string, savedVersion: number, revision: number, updatedAt: string): void;
  markSaveIssue(sceneId: string, issue: SaveIssue | null): void;
  /** Replace local scene with the server copy (discarding local edits). */
  acceptServerScene(scene: Scene): void;
  /** Keep local edits and overwrite the server copy on next save. */
  overrideServerScene(sceneId: string, serverRevision: number): void;
}

function activeScene(state: EditorState): EditorScene | undefined {
  return state.scenes[state.activeSceneId];
}

export const useEditorStore = create<EditorState>()((set, get) => ({
  projectId: "",
  brandId: "",
  kit: undefined as unknown as BrandKit,
  assets: [],
  scenes: {},
  sceneOrder: [],
  activeSceneId: "",
  selectedLayerId: null,
  history: history.emptyHistory(),
  zoom: "fit",
  savingSceneIds: [],
  saveIssues: {},
  lastSavedAt: null,
  canvasMode: "edit",
  focusEditLayerId: null,
  uploadTarget: null,
  previewRequest: { nonce: 0, fromMs: 0 },
  motionPresets: [],
  fontStatus: {},
  fontsVersion: 0,
  pendingPhotoChange: null,

  init({ projectId, brandId, kit, assets, scenes, uploadTarget, motionPresets = [] }) {
    const ordered = [...scenes].sort((a, b) => a.position - b.position);
    set({
      projectId,
      brandId,
      kit,
      assets,
      scenes: Object.fromEntries(ordered.map((s) => [s.id, { ...s, editVersion: 0, savedVersion: 0 }])),
      sceneOrder: ordered.map((s) => s.id),
      activeSceneId: ordered[0]?.id ?? "",
      selectedLayerId: null,
      history: history.emptyHistory(),
      zoom: "fit",
      savingSceneIds: [],
      saveIssues: {},
      lastSavedAt: null,
      canvasMode: "edit",
      focusEditLayerId: null,
      uploadTarget,
      motionPresets,
      pendingPhotoChange: null,
    });
  },

  setActiveScene(sceneId) {
    if (get().scenes[sceneId]) set({ activeSceneId: sceneId, selectedLayerId: null, focusEditLayerId: null });
  },

  selectLayer(layerId) {
    // Focus editing belongs to one layer; selecting anything else finishes it.
    set((state) => ({
      selectedLayerId: layerId,
      focusEditLayerId: state.focusEditLayerId === layerId ? state.focusEditLayerId : null,
    }));
  },

  setZoom(zoom) {
    set({ zoom });
  },

  mutateScene(sceneId, recipe, coalesceKey) {
    const state = get();
    const scene = state.scenes[sceneId];
    if (!scene) return;
    const before = { name: scene.name, document: scene.document };
    const after = recipe(before);
    if (after.name === before.name && after.document === before.document) return;
    set({
      scenes: {
        ...state.scenes,
        [sceneId]: { ...scene, name: after.name, document: after.document, editVersion: scene.editVersion + 1 },
      },
      history: history.pushHistory(state.history, { sceneId, before, after, coalesceKey, at: Date.now() }),
    });
  },

  updateLayer(layerId, patch, coalesceKey) {
    const { activeSceneId, mutateScene } = get();
    mutateScene(activeSceneId, (s) => ({ ...s, document: ops.updateLayer(s.document, layerId, patch) }), coalesceKey);
  },

  addLayer(layer) {
    const { activeSceneId, mutateScene, kit } = get();
    const assets = assetMap(get().assets);
    mutateScene(activeSceneId, (s) => {
      let document = ops.addLayer(s.document, layer);
      // A new photo frame gets its photo's disclosure automatically.
      const asset = layer.type === "image" && layer.assetId ? assets.get(layer.assetId) : undefined;
      if (asset && requiresDisclosure(asset)) {
        document = ensureDisclosureLayer(document, layer.id, asset, kit, measurer());
      }
      return { ...s, document };
    });
    set({ selectedLayerId: layer.id });
  },

  removeLayer(layerId) {
    const { activeSceneId, scenes } = get();
    const doc = scenes[activeSceneId]?.document;
    if (!doc) return;
    const plan = planLayerRemoval(doc, layerId);
    if (plan.prompt) {
      set({ pendingPhotoChange: { sceneId: activeSceneId, kind: "remove", layerId, assetId: null, plan } });
      return;
    }
    commitRemoval(activeSceneId, layerId, plan, "apply");
  },

  changePhoto(layerId, assetId) {
    const { activeSceneId, scenes, assets } = get();
    const doc = scenes[activeSceneId]?.document;
    if (!doc) return;
    const byId = assetMap(assets);
    const plan = planPhotoChange(doc, layerId, assetId ? (byId.get(assetId) ?? null) : null, byId);
    if (plan.prompt) {
      set({ pendingPhotoChange: { sceneId: activeSceneId, kind: "photo", layerId, assetId, plan } });
      return;
    }
    commitPhotoChange(activeSceneId, layerId, assetId, plan, "apply");
  },

  resolvePhotoChange(decision) {
    const pending = get().pendingPhotoChange;
    set({ pendingPhotoChange: null });
    if (!pending || !decision) return;
    if (pending.kind === "remove") commitRemoval(pending.sceneId, pending.layerId, pending.plan, decision);
    else commitPhotoChange(pending.sceneId, pending.layerId, pending.assetId, pending.plan, decision);
  },

  assignSlotPhoto(slot, assetId) {
    const { activeSceneId, mutateScene, kit } = get();
    const assets = assetMap(get().assets);
    mutateScene(activeSceneId, (s) => {
      let document = assignScenePhoto(s.document, slot, assetId, kit);
      const frame = photoPair(document)[slot === 1 ? "photo1" : "photo2"];
      const asset = assets.get(assetId);
      if (frame && asset && requiresDisclosure(asset)) {
        document = ensureDisclosureLayer(document, frame.id, asset, kit, measurer());
      }
      return { ...s, document };
    });
  },

  fixDisclosure(issue) {
    const { activeSceneId, mutateScene, kit } = get();
    const assets = assetMap(get().assets);
    mutateScene(activeSceneId, (s) => {
      const doc = s.document;
      switch (issue.fix) {
        case "add": {
          const frame = doc.layers.find((l) => l.id === issue.imageLayerId);
          const asset = frame && "assetId" in frame && frame.assetId ? assets.get(frame.assetId) : undefined;
          return asset && issue.imageLayerId
            ? { ...s, document: ensureDisclosureLayer(doc, issue.imageLayerId, asset, kit, measurer()) }
            : s;
        }
        case "show":
          return issue.layerId
            ? { ...s, document: ops.updateLayer(doc, issue.layerId, { visible: true, opacity: 1 }) }
            : s;
        case "fitHeight":
          return issue.layerId ? { ...s, document: fitDisclosureHeight(doc, issue.layerId, assets, measurer()) } : s;
        case "moveIntoSafeArea":
          return issue.layerId ? { ...s, document: moveIntoSafeArea(doc, issue.layerId, assets, measurer()) } : s;
        case "remove":
          return issue.layerId ? { ...s, document: ops.removeLayer(doc, issue.layerId) } : s;
        default:
          return s;
      }
    });
  },

  syncAssetDisclosures(asset) {
    const totals = { added: 0, removed: 0 };
    const { kit } = get();
    for (const sceneId of get().sceneOrder) {
      const scene = get().scenes[sceneId];
      if (!scene) continue;
      const result = syncDisclosuresForAsset(scene.document, asset, kit, measurer());
      if (!result.changed) continue;
      totals.added += result.added;
      totals.removed += result.removed;
      get().mutateScene(sceneId, (s) => ({ ...s, document: result.doc }));
    }
    return totals;
  },

  duplicateLayer(layerId) {
    const { activeSceneId, mutateScene } = get();
    let newId: string | null = null;
    mutateScene(activeSceneId, (s) => {
      const result = ops.duplicateLayer(s.document, layerId);
      newId = result.newId;
      return { ...s, document: result.doc };
    });
    if (newId) set({ selectedLayerId: newId });
  },

  reorderLayer(layerId, direction) {
    const { activeSceneId, mutateScene } = get();
    mutateScene(activeSceneId, (s) => ({ ...s, document: ops.reorderLayer(s.document, layerId, direction) }));
  },

  moveLayer(layerId, targetIndex) {
    const { activeSceneId, mutateScene } = get();
    mutateScene(activeSceneId, (s) => ({ ...s, document: ops.moveLayer(s.document, layerId, targetIndex) }));
  },

  alignLayer(layerId, alignment) {
    const { activeSceneId, mutateScene } = get();
    mutateScene(activeSceneId, (s) => ({ ...s, document: ops.alignLayerToScene(s.document, layerId, alignment) }));
  },

  updateDocument(patch, coalesceKey) {
    const { activeSceneId, mutateScene } = get();
    mutateScene(activeSceneId, (s) => ({ ...s, document: { ...s.document, ...patch } }), coalesceKey);
  },

  renameScene(name) {
    const { activeSceneId, mutateScene } = get();
    const trimmed = name.trim();
    if (!trimmed) return;
    mutateScene(activeSceneId, (s) => ({ ...s, name: trimmed }), `scene-name:${activeSceneId}`);
  },

  applyLayout(presetId) {
    const { activeSceneId, mutateScene, kit } = get();
    mutateScene(activeSceneId, (s) => ({ ...s, document: applyLayoutPreset(s.document, presetId, kit) }));
    set({ selectedLayerId: null });
  },

  undo() {
    const state = get();
    const result = history.undo(state.history);
    if (!result) return;
    applySnapshot(result.entry.sceneId, result.entry.before, result.history);
  },

  redo() {
    const state = get();
    const result = history.redo(state.history);
    if (!result) return;
    applySnapshot(result.entry.sceneId, result.entry.after, result.history);
  },

  addAsset(asset) {
    set((state) => ({ assets: [asset, ...state.assets.filter((a) => a.id !== asset.id)] }));
  },

  updateAsset(asset) {
    set((state) => ({ assets: state.assets.map((a) => (a.id === asset.id ? asset : a)) }));
  },

  removeAsset(assetId) {
    set((state) => ({ assets: state.assets.filter((a) => a.id !== assetId) }));
  },

  insertScene(scene, afterSceneId) {
    set((state) => {
      const order = [...state.sceneOrder];
      const index = order.indexOf(afterSceneId);
      order.splice(index === -1 ? order.length : index + 1, 0, scene.id);
      return {
        scenes: { ...state.scenes, [scene.id]: { ...scene, editVersion: 0, savedVersion: 0 } },
        sceneOrder: order,
        activeSceneId: scene.id,
        selectedLayerId: null,
      };
    });
  },

  setCanvasMode(mode) {
    set({ canvasMode: mode, focusEditLayerId: mode === "edit" ? get().focusEditLayerId : null });
  },

  setFocusEdit(layerId) {
    set({ focusEditLayerId: layerId, canvasMode: layerId ? "edit" : get().canvasMode });
  },

  playPreview(fromMs = 0) {
    set((state) => ({
      canvasMode: "preview",
      focusEditLayerId: null,
      previewRequest: { nonce: state.previewRequest.nonce + 1, fromMs },
    }));
  },

  playLayer(layerId) {
    const scene = get().scenes[get().activeSceneId];
    if (!scene) return;
    const timing = computeSceneTimings(scene.document.layers, scene.document.durationMs).get(layerId);
    // Start a moment early so the change is visible from rest.
    get().playPreview(Math.max(0, (timing?.start ?? 0) - 250));
  },

  setMotionPresets(motionPresets) {
    set({ motionPresets });
  },

  applyMotionToRole(role, motion) {
    let count = 0;
    for (const sceneId of get().sceneOrder) {
      const scene = get().scenes[sceneId];
      if (!scene?.document.layers.some((l) => l.role === role)) continue;
      get().mutateScene(sceneId, (s) => ({
        ...s,
        document: {
          ...s.document,
          layers: s.document.layers.map((l) => {
            if (l.role !== role) return l;
            count += 1;
            return { ...l, motion: motion(l) };
          }),
        },
      }));
    }
    return count;
  },

  setFontState(fontStatus, fontsVersion) {
    set({ fontStatus, fontsVersion });
  },

  setAssets(assets) {
    set({ assets });
  },

  markSaving(sceneId, saving) {
    set((state) => ({
      savingSceneIds: saving
        ? [...new Set([...state.savingSceneIds, sceneId])]
        : state.savingSceneIds.filter((id) => id !== sceneId),
    }));
  },

  markSaved(sceneId, savedVersion, revision, updatedAt) {
    set((state) => {
      const scene = state.scenes[sceneId];
      if (!scene) return {};
      const { [sceneId]: _cleared, ...saveIssues } = state.saveIssues;
      return {
        scenes: { ...state.scenes, [sceneId]: { ...scene, savedVersion, revision, updatedAt } },
        saveIssues,
        lastSavedAt: Date.now(),
      };
    });
  },

  markSaveIssue(sceneId, issue) {
    set((state) => {
      if (!issue) {
        const { [sceneId]: _cleared, ...rest } = state.saveIssues;
        return { saveIssues: rest };
      }
      return { saveIssues: { ...state.saveIssues, [sceneId]: issue } };
    });
  },

  acceptServerScene(scene) {
    set((state) => {
      const { [scene.id]: _cleared, ...saveIssues } = state.saveIssues;
      const version = (state.scenes[scene.id]?.editVersion ?? 0) + 1;
      return {
        scenes: { ...state.scenes, [scene.id]: { ...scene, editVersion: version, savedVersion: version } },
        history: history.forgetScene(state.history, scene.id),
        saveIssues,
        selectedLayerId: state.activeSceneId === scene.id ? null : state.selectedLayerId,
      };
    });
  },

  overrideServerScene(sceneId, serverRevision) {
    set((state) => {
      const scene = state.scenes[sceneId];
      if (!scene) return {};
      const { [sceneId]: _cleared, ...saveIssues } = state.saveIssues;
      // Bump editVersion so autosave picks the scene up again.
      return {
        scenes: {
          ...state.scenes,
          [sceneId]: { ...scene, revision: serverRevision, editVersion: scene.editVersion + 1 },
        },
        saveIssues,
      };
    });
  },
}));

function assetMap(assets: Asset[]): Map<string, Asset> {
  return new Map(assets.map((a) => [a.id, a]));
}

let cachedMeasure: MeasureText | undefined;
/** Canvas text measurement in the browser (same font stack the renderers use). */
function measurer(): MeasureText | undefined {
  cachedMeasure ??= canvasMeasure(fontStack);
  return cachedMeasure;
}

function commitPhotoChange(
  sceneId: string,
  layerId: string,
  assetId: string | null,
  plan: PhotoChangePlan,
  decision: DisclosureDecision,
) {
  const { mutateScene, kit } = useEditorStore.getState();
  const assets = assetMap(useEditorStore.getState().assets);
  mutateScene(sceneId, (s) => {
    const withPhoto = ops.updateLayer(s.document, layerId, { assetId });
    return { ...s, document: applyDisclosureDecision(withPhoto, layerId, plan, decision, assets, kit, measurer()) };
  });
}

function commitRemoval(sceneId: string, layerId: string, plan: PhotoChangePlan, decision: DisclosureDecision) {
  const { mutateScene, selectedLayerId } = useEditorStore.getState();
  const assets = assetMap(useEditorStore.getState().assets);
  mutateScene(sceneId, (s) => {
    const linked = disclosureLayersFor(s.document, layerId).map((l) => l.id);
    let document = s.document;
    if (linked.length > 0) {
      document =
        decision === "keepAsText" ? detachDisclosures(document, linked, assets) : removeLayers(document, linked);
    }
    return { ...s, document: ops.removeLayer(document, layerId) };
  });
  if (selectedLayerId === layerId) useEditorStore.setState({ selectedLayerId: null });
}

function applySnapshot(sceneId: string, snapshot: history.SceneSnapshot, nextHistory: history.HistoryState) {
  useEditorStore.setState((state) => {
    const scene = state.scenes[sceneId];
    if (!scene) return { history: nextHistory };
    const selectedStillExists = snapshot.document.layers.some((l) => l.id === state.selectedLayerId);
    return {
      scenes: {
        ...state.scenes,
        [sceneId]: { ...scene, name: snapshot.name, document: snapshot.document, editVersion: scene.editVersion + 1 },
      },
      history: nextHistory,
      activeSceneId: sceneId,
      selectedLayerId: selectedStillExists && state.activeSceneId === sceneId ? state.selectedLayerId : null,
    };
  });
}

export function useActiveScene(): EditorScene | undefined {
  return useEditorStore(activeScene);
}

export function useSelectedLayer(): Layer | undefined {
  return useEditorStore((state) => {
    const scene = activeScene(state);
    return scene?.document.layers.find((l) => l.id === state.selectedLayerId);
  });
}

export function isSceneDirty(scene: EditorScene): boolean {
  return scene.editVersion !== scene.savedVersion;
}
