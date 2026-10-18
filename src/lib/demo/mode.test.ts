import { afterEach, describe, expect, it, vi } from "vitest";
import { isDemoMode } from "./mode";

afterEach(() => vi.unstubAllEnvs());

describe("isDemoMode", () => {
  it("is on only in development with DEMO_MODE=1", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEMO_MODE", "1");
    expect(isDemoMode()).toBe(true);
  });

  it("can never turn on in production or test builds", () => {
    vi.stubEnv("DEMO_MODE", "1");
    for (const env of ["production", "test"]) {
      vi.stubEnv("NODE_ENV", env);
      expect(isDemoMode()).toBe(false);
    }
  });

  it("is off in development unless explicitly enabled", () => {
    vi.stubEnv("NODE_ENV", "development");
    for (const value of [undefined, "", "0", "true"]) {
      vi.stubEnv("DEMO_MODE", value as string);
      expect(isDemoMode()).toBe(false);
    }
  });
});
