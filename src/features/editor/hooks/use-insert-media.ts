"use client";

import { useCallback } from "react";
import { assetLabel, type Asset } from "@/domain/asset";
import { photoMotion, textMotion } from "@/domain/brand-motion";
import { makeLayer, type ImageLayer, type LogoLayer } from "@/domain/scene";
import { aspectFrame } from "@/domain/scene-photos";
import { useEditorStore } from "../store/editor-store";

/** Inserts photos and logos as new layers that keep the file's aspect ratio. */
export function useInsertMedia() {
  const addLayer = useEditorStore((s) => s.addLayer);

  const insertPhoto = useCallback(
    (asset: Asset, at?: { x: number; y: number }) => {
      const { scenes, activeSceneId, kit } = useEditorStore.getState();
      const doc = scenes[activeSceneId]?.document;
      if (!doc) return;
      addLayer(
        makeLayer<ImageLayer>({
          type: "image",
          name:
            assetLabel(asset)
              .replace(/\.[^.]+$/, "")
              .slice(0, 80) || "Photo",
          assetId: asset.id,
          fit: "cover",
          focalX: 0.5,
          focalY: 0.5,
          zoom: 1,
          motion: photoMotion(kit),
          ...aspectFrame(doc, asset, 0.8, at),
        }),
      );
    },
    [addLayer],
  );

  const insertLogo = useCallback(
    (asset: Asset, at?: { x: number; y: number }) => {
      const { scenes, activeSceneId, kit } = useEditorStore.getState();
      const doc = scenes[activeSceneId]?.document;
      if (!doc) return;
      addLayer(
        makeLayer<LogoLayer>({
          type: "logo",
          role: "logo",
          name:
            assetLabel(asset)
              .replace(/\.[^.]+$/, "")
              .slice(0, 80) || "Logo",
          assetId: asset.id,
          motion: textMotion(kit),
          ...aspectFrame(doc, asset, 0.35, at ?? { x: doc.width / 2, y: doc.height * 0.12 }),
        }),
      );
    },
    [addLayer],
  );

  return { insertPhoto, insertLogo };
}
