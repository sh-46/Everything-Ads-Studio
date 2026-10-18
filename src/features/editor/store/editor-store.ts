"use client";

import { create } from "zustand";
import type { Asset } from "@/domain/asset";
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

  init(input: { projectId: string; brandId: string; kit: BrandKit; assets: Asset[]; scenes: Scene[] }): void;
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
  removeLayer(layerId: string): void;
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
  setAssets(assets: Asset[]): void;

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

  init({ projectId, brandId, kit, assets, scenes }) {
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
    });
  },

  setActiveScene(sceneId) {
    if (get().scenes[sceneId]) set({ activeSceneId: sceneId, selectedLayerId: null });
  },

  selectLayer(layerId) {
    set({ selectedLayerId: layerId });
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
    const { activeSceneId, mutateScene } = get();
    mutateScene(activeSceneId, (s) => ({ ...s, document: ops.addLayer(s.document, layer) }));
    set({ selectedLayerId: layer.id });
  },

  removeLayer(layerId) {
    const { activeSceneId, mutateScene, selectedLayerId } = get();
    mutateScene(activeSceneId, (s) => ({ ...s, document: ops.removeLayer(s.document, layerId) }));
    if (selectedLayerId === layerId) set({ selectedLayerId: null });
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
