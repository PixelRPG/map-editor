#!/usr/bin/env python3
"""Generate the tree-house map from an ASCII plan of the FSA original.

The authoritative layout reference is the FSA project's own screenshot
(`zelda-games/references/fsa_links_house_reference.png`, the rendered
`links_house` room at 21x15 tiles). Its art pass is older than the
`finalized/` tileset we ship, so this script rebuilds the LAYOUT with
the finalized graphics: an ASCII plan (read off the labeled reference)
plus a legend mapping plan characters to sheet cells.

Run from the repo root:
  python3 games/zelda-like/tools/build-tree-house.py

It rewrites `games/zelda-like/maps/tree-house.json` (ground layer +
placements stay untouched except positions defined here) and expects
`games/zelda-like/spritesets/tree-house.png` to be the FULL 256x256
finalized interior sheet (16x16 cells, sprite id = row*16+col).
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
GAME = ROOT / "games" / "zelda-like"

COLS, ROWS = 21, 15
SHEET_COLS = 16

# ── plan: one char per tile, read from the labeled reference shot.
# Walls are 2 tiles thick; the door gap sits at x=10 in the bottom wall.
PLAN = [
    "                     ",
    "      TTTTTTTTT      ",
    "     1ttttttttt3     ",
    "    1t,,,,,,,,,t3    ",
    "   Ll,,,EEE,g,,,rR   ",
    "   LlvssEEE,,,,,vrR  ",
    "   Ll,AAA,RRR,DD,rR  ",
    "   Ll,AAA,RRR,DD,rR  ",
    "   Ll,AAA,RRR,,,vrR  ",
    "   Ll,o,,,,,,,Q,,rR  ",
    "   Ll,oo,,,,,pQ,,rR  ",
    "    5b,,,,,,,,,b7    ",
    "     5bbbbmbbbb7     ",
    "      BBBBmBBBB      ",
    "                     ",
]

# ── legend: char → (sheet col, sheet row); None = leave empty.
# Multi-cell furniture uses REGION anchors (see REGIONS) so the blocks
# blit coherently instead of repeating one cell.
LEGEND = {
    " ": None,
    "T": (5, 0),   # top wall cap
    "t": (5, 1),   # top wall front
    "L": (0, 5),   # left wall outer
    "l": (1, 5),   # left wall inner
    "r": (9, 6),   # right wall inner
    "R": (10, 5),  # right wall outer
    "1": (1, 1),   # NW diagonal
    "3": (9, 2),   # NE diagonal
    "5": (1, 9),   # SW diagonal
    "7": (9, 8),   # SE diagonal
    "B": (5, 10),  # bottom wall cap
    "b": (6, 9),   # bottom wall front
    "v": (12, 8),  # wall vine
    ",": (4, 2),   # light floor
    ".": (8, 2),   # dark floor
    "m": (1, 11),  # door mat
    "s": (4, 6),   # wooden stool
    "g": (5, 6),   # gray stool
    "o": (9, 5),   # barrel
    "p": (6, 8),   # pot
}

# Regions: anchor char at its top-left occurrence blits a sheet block.
REGIONS = {
    "A": {"sheet": (3, 3), "size": (3, 3)},    # big table
    "R": {"sheet": (0, 13), "size": (3, 3)},   # round rug with emblem
    "E": {"sheet": (6, 3), "size": (3, 2)},    # bed
    "D": {"sheet": (14, 10), "size": (2, 2)},  # bottle dresser
    "Q": {"sheet": (14, 12), "size": (1, 2)},  # tall red pot
}
# NOTE: 'R'/'B' appear both as wall chars and region anchors; regions are
# resolved FIRST for contiguous blocks fully inside the floor area
# (x 4..16, y 3..11), walls keep the LEGEND meaning outside it.

WALKABLE = {",", ".", "m", " "}


def main() -> None:
    grid: dict[tuple[int, int], tuple[int, int]] = {}
    consumed: set[tuple[int, int]] = set()

    def in_floor(x: int, y: int) -> bool:
        return 4 <= x <= 16 and 3 <= y <= 11

    # 1. regions (anchored at first cell of each contiguous block)
    for char, region in REGIONS.items():
        w, h = region["size"]
        sc, sr = region["sheet"]
        for y in range(ROWS):
            for x in range(COLS):
                if PLAN[y][x] != char or (x, y) in consumed or not in_floor(x, y):
                    continue
                # treat as anchor only if the full block is this char
                if all(
                    0 <= x + dx < COLS and 0 <= y + dy < ROWS and PLAN[y + dy][x + dx] == char
                    for dx in range(w)
                    for dy in range(h)
                ):
                    for dy in range(h):
                        for dx in range(w):
                            grid[(x + dx, y + dy)] = (sc + dx, sr + dy)
                            consumed.add((x + dx, y + dy))

    # 2. singles
    for y in range(ROWS):
        for x in range(COLS):
            if (x, y) in consumed:
                continue
            ref = LEGEND.get(PLAN[y][x])
            if ref is not None:
                grid[(x, y)] = ref

    # 3. floor underlay below furniture/props so transparent cells read
    floor = LEGEND[","]
    sprites = []
    for (x, y), (sc, sr) in sorted(grid.items(), key=lambda kv: (kv[0][1], kv[0][0])):
        sprites.append({"x": x, "y": y, "spriteId": sr * SHEET_COLS + sc, "spriteSetId": "tree-house"})
    underlay = [
        {"x": x, "y": y, "spriteId": floor[1] * SHEET_COLS + floor[0], "spriteSetId": "tree-house"}
        for (x, y) in sorted(consumed | {k for k, v in grid.items() if PLAN[k[1]][k[0]] in "sgopvQ"})
    ]

    map_path = GAME / "maps" / "tree-house.json"
    data = json.loads(map_path.read_text())
    data["columns"] = COLS
    data["rows"] = ROWS
    for layer in data["layers"]:
        if layer["id"] == "layer_ground":
            layer["sprites"] = underlay
        if layer["id"] == "layer_decor":
            layer["sprites"] = sprites
    if not any(l["id"] == "layer_decor" for l in data["layers"]):
        data["layers"].insert(1, {"id": "layer_decor", "name": "Decor", "visible": True, "tier": "hero", "sprites": sprites})

    # placements: door trigger on the mat, spawn on free floor
    for p in data["objectPlacements"]:
        if p["id"] == "tp-exit-to-forest":
            p["tileX"], p["tileY"] = 10, 13
        if p["id"] == "spawn-player":
            p["tileX"], p["tileY"] = 10, 10
    map_path.write_text(json.dumps(data, indent=2) + "\n")
    print(f"tree-house rebuilt: {len(underlay)} ground + {len(sprites)} decor tiles")


if __name__ == "__main__":
    main()
