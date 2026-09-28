/** A file of public/, under the site's base URL: GitHub Pages serves it from a sub-path. */
export function useAsset() {
  const base = useRuntimeConfig().app.baseURL;
  return (path: string) => `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}
