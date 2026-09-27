export function loginHref(returnTo: string): string {
  return `/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export function safeReturnTo(candidate: string | null, origin: string): string {
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//'))
    return '/account';
  try {
    const target = new URL(candidate, origin);
    if (target.origin !== origin || target.pathname === '/login')
      return '/account';
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return '/account';
  }
}
