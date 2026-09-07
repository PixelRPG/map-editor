#!/usr/bin/env python3
"""Read org.pixelrpg.maker.Control.GetStatus and print selected fields.

gdbus prints a GVariant string: single-quoted when the payload has no
apostrophe, double-quoted WITH backslash-escaped inner quotes when it
does (zelda-like has "Link's Tree House", so both forms show up in one
session). Parsing the raw text with grep therefore lies. Go through
ast.literal_eval, which handles both.
"""
import ast
import json
import subprocess
import sys

label = sys.argv[1]
fields = sys.argv[2:] or ["engineReady"]
dest = f"org.pixelrpg.maker.{label}"
path = f"/org/pixelrpg/maker/{label}/control"

try:
    r = subprocess.run(
        ["gdbus", "call", "--session", "--dest", dest, "--object-path", path,
         "--method", "org.pixelrpg.maker.Control.GetStatus"],
        capture_output=True, text=True, timeout=20,
    )
except subprocess.TimeoutExpired:
    print("ERROR=timeout")
    sys.exit(2)

if r.returncode != 0:
    print("ERROR=nobus")
    sys.exit(2)

try:
    payload = ast.literal_eval(r.stdout.strip())[0]
    st = json.loads(payload)
except Exception as exc:  # noqa: BLE001
    print(f"ERROR=parse:{exc}")
    sys.exit(2)

if fields == ["ALL"]:
    print(json.dumps(st))
    sys.exit(0)

for f in fields:
    v = st.get(f)
    if f == "sceneIds":
        v = ",".join(v or [])
    print(f"{f}={v}")
