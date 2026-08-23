# ART-REVIEW — archer-side-contrast

- Reviewer: Codex
- Final review basis: source-preserving palette transformation using the frozen 192×192 alpha masks and pixel silhouettes.
- Final preview set: `work-docs/art-previews/<name>-{192,28,40,55}-{color,grayscale}.png`.
- Full-color decision: blue-side uses the existing muted ivory/steel-blue palette; red-side uses the existing coral/deep-wine palette, with shared brass and navy accents.
- Value-only decision: the blue-side remains lighter at source and 28px/40px/55px board sizes.
- Automated floor across the 12 accepted pairs and all measured sizes: shared warm overlap `0.000`, opponent margin minimum `0.207`, side-value ratio minimum `2.825`, alpha-mask IoU `1.000`.

## Accepted affected pairs

| Pair | Final WebP pair | Preview evidence | Silhouette / full-color / value-only result | Disposition |
|---|---|---|---|---|
| archer | `src/ui/art/assets/piece-archer-white.webp`, `src/ui/art/assets/piece-archer-black.webp` | `work-docs/art-previews/archer-{192,28,40,55}-{color,grayscale}.png` | Same archer, warm ivory body versus muted coral body with brass bow details; value order holds at every measured size. | accept |
| banner | `src/ui/art/assets/piece-banner-white.webp`, `src/ui/art/assets/piece-banner-black.webp` | `work-docs/art-previews/banner-{192,28,40,55}-{color,grayscale}.png` | Same banner and pole, light steel-blue versus deep wine with restrained brass; value order holds at every measured size. | accept |
| bow | `src/ui/art/assets/piece-bow-white.webp`, `src/ui/art/assets/piece-bow-black.webp` | `work-docs/art-previews/bow-{192,28,40,55}-{color,grayscale}.png` | Same bow silhouette, muted steel-blue versus wine-red; the string remains readable and value order holds. | accept |
| lantern | `src/ui/art/assets/piece-lantern-white.webp`, `src/ui/art/assets/piece-lantern-black.webp` | `work-docs/art-previews/lantern-{192,28,40,55}-{color,grayscale}.png` | Same lantern and flame detail, ivory/steel highlights versus deep wine; value order holds. | accept |
| orb | `src/ui/art/assets/piece-orb-white.webp`, `src/ui/art/assets/piece-orb-black.webp` | `work-docs/art-previews/orb-{192,28,40,55}-{color,grayscale}.png` | Same orb and pedestal, light steel-blue versus deep wine with brass trim; value order holds. | accept |
| queen | `src/ui/art/assets/piece-queen-white.webp`, `src/ui/art/assets/piece-queen-black.webp` | `work-docs/art-previews/queen-{192,28,40,55}-{color,grayscale}.png` | Same crown and body, ivory versus the existing muted coral body; value order holds. | accept |
| shield | `src/ui/art/assets/piece-shield-white.webp`, `src/ui/art/assets/piece-shield-black.webp` | `work-docs/art-previews/shield-{192,28,40,55}-{color,grayscale}.png` | Same shield silhouette, steel-blue and pale brass versus deep wine and dark brass; value order holds. | accept |
| staff | `src/ui/art/assets/piece-staff-white.webp`, `src/ui/art/assets/piece-staff-black.webp` | `work-docs/art-previews/staff-{192,28,40,55}-{color,grayscale}.png` | Same staff and finial, light steel shaft versus deep wine shaft with brass finial; value order holds despite the narrow shaft. | accept |
| talon | `src/ui/art/assets/piece-talon-white.webp`, `src/ui/art/assets/piece-talon-black.webp` | `work-docs/art-previews/talon-{192,28,40,55}-{color,grayscale}.png` | Same claw silhouette and highlights, ivory/steel versus muted coral and wine; value order holds. | accept |
| urn | `src/ui/art/assets/piece-urn-white.webp`, `src/ui/art/assets/piece-urn-black.webp` | `work-docs/art-previews/urn-{192,28,40,55}-{color,grayscale}.png` | Same handles and ornament, ivory and steel-blue versus coral and deep wine; value order holds. | accept |
| watchtower | `src/ui/art/assets/piece-watchtower-white.webp`, `src/ui/art/assets/piece-watchtower-black.webp` | `work-docs/art-previews/watchtower-{192,28,40,55}-{color,grayscale}.png` | Same tower and gate, warm ivory/steel versus muted coral/deep wine; value order holds. | accept |
| wheel | `src/ui/art/assets/piece-wheel-white.webp`, `src/ui/art/assets/piece-wheel-black.webp` | `work-docs/art-previews/wheel-{192,28,40,55}-{color,grayscale}.png` | Same wheel and spokes, pale steel-blue versus deep wine with brass accents; value order holds. | accept |

## Rejected imagegen proof-of-concept

The archer imagegen candidates were reviewed before replacement. The white candidate changed the source framing and introduced edge artifacts when aligned to the original mask. The black candidate emitted a checkerboard as opaque RGB pixels and therefore failed the transparent-background contract. Both were rejected; no generated candidate replaced a production WebP. The rejected local evidence remains under `work-docs/art-candidates/`.

## Excluded borderline pairs

`bell`, `chalice`, `helm`, `obelisk`, and `warhorse` remain excluded after color and grayscale review. Their cream/white versus red body masses remain distinguishable at 192px and board sizes, so changing them would expand the asset diff without addressing the reported ambiguity.
