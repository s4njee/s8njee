export function resolveAssetUrl(path) {
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  const base = import.meta.env.BASE_URL || '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}${normalizedPath}`;
}
