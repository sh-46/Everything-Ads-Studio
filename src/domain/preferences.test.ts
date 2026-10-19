import { describe, expect, it } from "vitest";
import { editorPreferencesSchema, MAX_REMEMBERED_PROJECTS, mergePreferences } from "./preferences";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("editor preferences", () => {
  it("merges zoom and remembers the last scene per project", () => {
    const merged = mergePreferences(
      { zoom: "fit", lastSceneByProject: { [id(1)]: id(10) } },
      { zoom: 0.5, lastSceneByProject: { [id(2)]: id(20) } },
    );
    expect(merged).toEqual({ zoom: 0.5, lastSceneByProject: { [id(1)]: id(10), [id(2)]: id(20) } });
  });

  it("keeps only the most recently used projects", () => {
    let prefs = {};
    for (let i = 0; i < MAX_REMEMBERED_PROJECTS + 5; i++) {
      prefs = mergePreferences(prefs, { lastSceneByProject: { [id(i)]: id(1000 + i) } });
    }
    prefs = mergePreferences(prefs, { lastSceneByProject: { [id(5)]: id(9) } }); // touch an old one
    const kept = Object.keys((prefs as { lastSceneByProject: object }).lastSceneByProject);
    expect(kept).toHaveLength(MAX_REMEMBERED_PROJECTS);
    expect(kept.at(-1)).toBe(id(5));
    expect(kept).not.toContain(id(4));
    expect(kept).toContain(id(6));
  });

  it("rejects bad values and keeps unknown keys", () => {
    expect(editorPreferencesSchema.safeParse({ zoom: 99 }).success).toBe(false);
    expect(editorPreferencesSchema.parse({ zoom: "fit", other: 1 })).toEqual({ zoom: "fit", other: 1 });
  });
});
