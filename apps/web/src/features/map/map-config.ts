export interface PublicMapConfig {
  styleUrl: string | null;
  attribution: string | null;
}

export function publicMapConfig(): PublicMapConfig {
  const candidate = process.env.NEXT_PUBLIC_MAP_STYLE_URL?.trim();
  let styleUrl: string | null = null;
  if (candidate) {
    try {
      const parsed = new URL(candidate);
      if (
        (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        !parsed.username &&
        !parsed.password
      )
        styleUrl = parsed.toString();
    } catch {
      styleUrl = null;
    }
  }
  const rawAttribution = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION?.trim();
  const attribution =
    rawAttribution &&
    rawAttribution.length <= 200 &&
    !/[<>]/.test(rawAttribution)
      ? rawAttribution
      : null;
  return { styleUrl, attribution };
}
