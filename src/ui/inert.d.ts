import 'react'

/**
 * `inert` for React 18.
 *
 * React 19 types it; 18.3 does not, so a bare `inert` prop is a type error and
 * the usual workaround is a cast that also casts away every neighbouring typo.
 * Declared as `string | undefined` rather than `boolean` deliberately: React 18
 * serialises an unknown boolean prop as the string `"true"`/`"false"`, and
 * `inert="false"` is still a PRESENT attribute — which makes the subtree inert
 * exactly when it should not be. Callers pass `''` or omit the prop.
 */
declare module 'react' {
  interface HTMLAttributes<T> {
    inert?: string | undefined
  }
}
