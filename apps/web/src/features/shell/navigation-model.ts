export function isAuthRoute(path: string) {
  return [
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
  ].includes(path);
}
export function isNavigationActive(path: string, href: string) {
  if (href === '/cars')
    return (
      path === '/cars' ||
      path.startsWith('/cars/') ||
      path.startsWith('/listings/')
    );
  return path === href || (href !== '/' && path.startsWith(`${href}/`));
}
export function unreadLabel(label: string, count: number | null) {
  return count !== null && count > 0
    ? `${label}, непрочитанных: ${count > 99 ? '99+' : count}`
    : label;
}
export function boundedUnread(count: number | null) {
  return count !== null && count > 0
    ? count > 99
      ? '99+'
      : String(count)
    : null;
}
