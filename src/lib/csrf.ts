export function getCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|;\s*)impact_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1] ?? '') : '';
}
