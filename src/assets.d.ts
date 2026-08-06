/**
 * Asset imports resolve to the URL Vite emits for them.
 *
 * Declared explicitly rather than by pulling in `vite/client`, which would add
 * a large ambient surface (`import.meta.env`, every other asset type, HMR) for
 * one thing this project actually uses. The import form is what matters and it
 * is not a style choice: an imported asset is emitted INTO the bundle with a
 * hashed name, which is what makes the generated service worker precache it
 * (see `vite-plugin-sw.ts`). A path string pointing at `public/` would type-check,
 * render in dev, and 404 on an installed phone.
 */
declare module '*.webp' {
  const src: string
  export default src
}
