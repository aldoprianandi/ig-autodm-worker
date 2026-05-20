export function selectMessageVariant(primaryText: string | null | undefined, variants: string[] | undefined, seed: string): string | null {
  const options = normalizeMessageVariants(primaryText, variants);
  if (!options.length) return null;
  return options[stableIndex(seed, options.length)] ?? options[0];
}

export function normalizeMessageVariants(primaryText: string | null | undefined, variants: string[] | undefined): string[] {
  const values = [...(primaryText ? [primaryText] : []), ...(variants ?? [])];
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

function stableIndex(seed: string, size: number): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % size;
}
