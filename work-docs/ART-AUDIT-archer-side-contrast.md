# ART-AUDIT — archer-side-contrast

- Baseline SHA: `d50289114a92dc363aca7c90f060600884efab04`
- Pair count: 37
- Metric decoder: Playwright Chromium canvas
- Alpha inclusion: alpha >= 16/255
- Selection: archer is mandatory; include when shared warm overlap >= 0.2 or source side-value ratio < 1.25
- Borderline review margin: +/-0.03 around either selection threshold, plus archer

| Pair | Affected | Borderline | Shared warm overlap | Side-value ratio | Opponent margin | Mask IoU | Review | Rationale |
|---|---:|---:|---:|---:|---:|---:|---|---|
| anvil | exclude | no | 0.102 | 2.017 | 0.046 | 1.000 | pending | pending Codex review |
| archer | include | yes | 0.354 | 1.296 | 0.000 | 1.000 | include | Shared red body dominates both sides at every preview size. |
| axe | exclude | no | 0.085 | 2.034 | 0.010 | 1.000 | pending | pending Codex review |
| banner | include | yes | 0.202 | 1.068 | -0.007 | 1.000 | include | Both variants retain a blue banner, so red-side identity is weak. |
| bell | exclude | yes | 0.176 | 1.581 | 0.056 | 1.000 | exclude | Cream and red bell bodies remain distinct at board size. |
| bishop | exclude | no | 0.070 | 2.331 | 0.010 | 1.000 | pending | pending Codex review |
| bishop-plus | exclude | no | 0.040 | 2.986 | -0.397 | 0.744 | pending | pending Codex review |
| bow | include | yes | 0.216 | 1.253 | 0.022 | 1.000 | include | Shared warm string mass competes with the red-side cue at small sizes. |
| cannon | exclude | no | 0.154 | 1.554 | 0.001 | 1.000 | pending | pending Codex review |
| censer | exclude | no | 0.125 | 1.635 | -0.000 | 1.000 | pending | pending Codex review |
| chalice | exclude | yes | 0.225 | 1.833 | 0.028 | 1.000 | exclude | Cream white cup and red black cup remain distinct in color and value. |
| cloak | exclude | no | 0.022 | 1.565 | 0.003 | 1.000 | pending | pending Codex review |
| crossbow | exclude | no | 0.124 | 1.781 | 0.003 | 1.000 | pending | pending Codex review |
| fang | exclude | no | 0.149 | 2.030 | 0.027 | 1.000 | pending | pending Codex review |
| gate | exclude | no | 0.118 | 1.601 | 0.024 | 1.000 | pending | pending Codex review |
| hammer | exclude | no | 0.107 | 1.832 | 0.007 | 1.000 | pending | pending Codex review |
| helm | exclude | yes | 0.198 | 1.933 | 0.002 | 1.000 | exclude | White and red helmet bodies remain clearly separable at small size. |
| king | exclude | no | 0.059 | 2.394 | -0.001 | 1.000 | pending | pending Codex review |
| knight | exclude | no | 0.041 | 2.301 | 0.003 | 1.000 | pending | pending Codex review |
| knight-plus | exclude | no | 0.028 | 2.413 | -0.543 | 0.775 | pending | pending Codex review |
| lance | exclude | no | 0.115 | 1.799 | 0.020 | 1.000 | pending | pending Codex review |
| lantern | include | no | 0.166 | 1.123 | 0.031 | 1.000 | pending | pending Codex review |
| obelisk | exclude | yes | 0.213 | 1.949 | 0.035 | 1.000 | exclude | Cream and red obelisk bodies remain visually distinct at small size. |
| orb | include | no | 0.128 | 1.200 | 0.039 | 1.000 | pending | pending Codex review |
| pawn | exclude | no | 0.165 | 1.994 | 0.001 | 1.000 | pending | pending Codex review |
| pawn-plus | exclude | no | 0.100 | 2.001 | -0.284 | 0.745 | pending | pending Codex review |
| queen | include | no | 0.264 | 1.670 | 0.004 | 1.000 | pending | pending Codex review |
| rook | exclude | no | 0.118 | 2.420 | -0.000 | 1.000 | pending | pending Codex review |
| rook-plus | exclude | no | 0.044 | 2.881 | -0.578 | 0.879 | pending | pending Codex review |
| shield | include | no | 0.265 | 1.042 | -0.004 | 1.000 | pending | pending Codex review |
| spear | exclude | no | 0.161 | 1.701 | 0.001 | 1.000 | pending | pending Codex review |
| staff | include | yes | 0.186 | 1.038 | 0.005 | 1.000 | include | Both bodies are blue, leaving the red-side identity too weak. |
| talon | include | no | 0.301 | 1.500 | 0.043 | 1.000 | pending | pending Codex review |
| urn | include | no | 0.376 | 1.301 | 0.044 | 1.000 | pending | pending Codex review |
| warhorse | exclude | yes | 0.215 | 1.370 | 0.067 | 1.000 | exclude | Cream and red horse faces remain clearly distinct at board size. |
| watchtower | include | no | 0.332 | 1.445 | 0.037 | 1.000 | pending | pending Codex review |
| wheel | include | no | 0.423 | 1.015 | 0.016 | 1.000 | pending | pending Codex review |
