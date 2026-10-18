export type Result<T = void> = { ok: true; data: T } | { ok: false; error: string };

export function ok<T>(data: T): Result<T>;
export function ok(): Result<void>;
export function ok<T>(data?: T): Result<T | undefined> {
  return { ok: true, data };
}

export function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}
