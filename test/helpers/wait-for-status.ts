export async function waitFor<T>(fn: () => T | Promise<T>, pred: (v: T) => boolean, timeoutMs = 10000, intervalMs = 50): Promise<T> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (pred(v)) return v;
    if (Date.now() > end) throw new Error(`waitFor timeout; last value: ${JSON.stringify(v)}`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/** Polls `getStatus` until the scan status is one of `wanted`. */
export function waitForStatus(getStatus: () => string | Promise<string>, wanted: string | string[], timeoutMs = 10000): Promise<string> {
  const set = Array.isArray(wanted) ? wanted : [wanted];
  return waitFor(getStatus, (s) => set.includes(s), timeoutMs);
}
