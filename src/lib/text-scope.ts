export function scopedTextPath(scope: string | null, path: string): string {
  if (!scope) return path;
  return `pageBySector.${scope}.${path}`;
}
