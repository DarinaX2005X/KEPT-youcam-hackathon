export const NAV_LINKS = [
  { href: '/shelf', label: 'Shelf' },
  { href: '/buy-check', label: 'Before you buy' },
] as const;

/** Full-screen flows draw their own chrome. */
export function isChromeless(pathname: string | null): boolean {
  if (!pathname) return false;
  return /\/check-in(\/|$)/.test(pathname);
}

export function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
