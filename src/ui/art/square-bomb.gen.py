"""Pipeline-proof mark for the 폭탄칸 square type.

Flat, high-contrast, deliberately NOT the ADR-002 storybook target — this asset
exists to prove bundler -> hashed emit -> SW precache -> render, and is replaced
by the generated batch. It has to read on the violet painted stripe
(#6d4d9c / #5b3f85) in both themes, which the OS emoji it replaces does not.
"""

import os
from pathlib import Path

from PIL import Image, ImageDraw

S = 192          # authored size; the square renders it at ~48-64 CSS px
SS = 4           # supersample factor for clean edges
N = S * SS

img = Image.new("RGBA", (N, N), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

CREAM = (250, 244, 230, 255)   # body fill — light, so it separates from violet
INK = (26, 22, 19, 255)        # outline — the same near-black the glyphs use
AMBER = (240, 168, 48, 255)    # spark
OUT = 9 * SS                   # outline weight

# body
cx, cy, r = N * 0.5, N * 0.60, N * 0.30
d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=CREAM, outline=INK, width=OUT)

# neck
nw, nh = N * 0.13, N * 0.10
ny = cy - r - nh * 0.55
d.rounded_rectangle([cx - nw, ny, cx + nw, ny + nh * 1.4], radius=N * 0.03,
                    fill=CREAM, outline=INK, width=OUT)

# fuse — a curve drawn as a thick arc, leaning right
fx0, fy0 = cx - N * 0.02, ny - N * 0.20
d.arc([fx0, fy0 - N * 0.06, fx0 + N * 0.30, fy0 + N * 0.22],
      start=150, end=340, fill=INK, width=OUT)

# spark
sx, sy, sr = fx0 + N * 0.30, fy0 + N * 0.02, N * 0.075
d.ellipse([sx - sr, sy - sr, sx + sr, sy + sr], fill=AMBER, outline=INK, width=OUT)

img = img.resize((S, S), Image.LANCZOS)

# Beside this script, which is the asset it regenerates. The first version wrote
# to the session temp directory it happened to be authored in — a path that does
# not exist on any other checkout, so the one thing a committed generator is for
# (reproducing the binary next to it) was the one thing it could not do.
out = Path(__file__).with_name("square-bomb.webp")
img.save(out, "WEBP", quality=90, method=6)
print("wrote", out, os.path.getsize(out), "bytes")
