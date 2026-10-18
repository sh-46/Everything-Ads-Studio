import { describe, expect, it } from "vitest";
import type { SceneDocument } from "@/domain/scene";
import { emptyHistory, forgetScene, HISTORY_LIMIT, pushHistory, redo, undo, type HistoryEntry } from "./history";

const doc = (background: string): SceneDocument => ({
  schemaVersion: 1,
  width: 1080,
  height: 1920,
  background,
  durationMs: 6000,
  layers: [],
});

const entry = (from: string, to: string, extra: Partial<HistoryEntry> = {}): HistoryEntry => ({
  sceneId: "a",
  before: { name: "A", document: doc(from) },
  after: { name: "A", document: doc(to) },
  at: 0,
  ...extra,
});

describe("history", () => {
  it("undo then redo round-trips", () => {
    let h = pushHistory(emptyHistory(), entry("#000000", "#111111"));
    const u = undo(h)!;
    expect(u.entry.before.document.background).toBe("#000000");
    h = u.history;
    expect(h.future).toHaveLength(1);
    const r = redo(h)!;
    expect(r.entry.after.document.background).toBe("#111111");
    expect(r.history.past).toHaveLength(1);
  });

  it("new edits clear the redo stack", () => {
    let h = pushHistory(emptyHistory(), entry("#000000", "#111111"));
    h = undo(h)!.history;
    h = pushHistory(h, entry("#000000", "#222222"));
    expect(h.future).toHaveLength(0);
  });

  it("coalesces rapid edits with the same key into one step", () => {
    let h = pushHistory(emptyHistory(), entry("#000000", "#111111", { coalesceKey: "bg", at: 0 }));
    h = pushHistory(h, entry("#111111", "#222222", { coalesceKey: "bg", at: 300 }));
    expect(h.past).toHaveLength(1);
    expect(h.past[0].before.document.background).toBe("#000000");
    expect(h.past[0].after.document.background).toBe("#222222");
  });

  it("does not coalesce across keys, scenes or long pauses", () => {
    let h = pushHistory(emptyHistory(), entry("#000000", "#111111", { coalesceKey: "bg", at: 0 }));
    h = pushHistory(h, entry("#111111", "#222222", { coalesceKey: "other", at: 100 }));
    h = pushHistory(h, entry("#222222", "#333333", { coalesceKey: "other", at: 5000 }));
    h = pushHistory(h, entry("#333333", "#444444", { coalesceKey: "other", sceneId: "b", at: 5100 }));
    expect(h.past).toHaveLength(4);
  });

  it("caps the number of steps", () => {
    let h = emptyHistory();
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) h = pushHistory(h, entry("#000000", "#111111", { at: i }));
    expect(h.past).toHaveLength(HISTORY_LIMIT);
  });

  it("forgetScene drops only that scene's steps", () => {
    let h = pushHistory(emptyHistory(), entry("#000000", "#111111"));
    h = pushHistory(h, entry("#000000", "#111111", { sceneId: "b" }));
    expect(forgetScene(h, "a").past.map((e) => e.sceneId)).toEqual(["b"]);
  });
});
