/** Turn flat dotted keys into nested objects for getMessage("a.b.c"). */
export function dotKeysToNested(flat: Record<string, string>): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(flat)) {
    const parts = k.split(".").filter(Boolean);
    if (parts.length === 0) continue;
    let cur: Record<string, unknown> = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      const next = cur[p];
      if (next && typeof next === "object" && !Array.isArray(next)) {
        cur = next as Record<string, unknown>;
      } else {
        const nu: Record<string, unknown> = {};
        cur[p] = nu;
        cur = nu;
      }
    }
    cur[parts[parts.length - 1]] = v;
  }
  return root;
}
