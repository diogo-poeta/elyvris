"""Check the layout file that Elyvris Studio writes in the browser (studio-gds.js).
Run with a Python that has klayout and gdsfactory:  python check_studio_gds.py
"""
import math
import os
import runpy
import tempfile
from pathlib import Path

import klayout.db as kdb

HERE = Path(__file__).resolve().parent / "gds-cases"
N = 144                                              # corners of a round outline

def ngon(a, b=None):
    """Area of the 144-corner polygon drawn inside an ellipse with half axes a, b (nm^2)."""
    return N / 2 * a * (a if b is None else b) * math.sin(2 * math.pi / N)

# layer -> list of (what, expected box (x1, y1, x2, y2) in nm, expected area in nm^2)
EXPECTED = {
    1: [("sphere r=90", (-390, 30, -210, 210), ngon(90)),
        ("ring R=400 w=100", (-1300, -400, -500, 400), ngon(400) - ngon(300))],
    2: [("cylinder r=150", (250, -150, 550, 150), ngon(150))],
    3: [("lying cylinder 600 x 80", (-300, -540, 300, -460), 600 * 80)],
    4: [("cone r=120", (-120, 380, 120, 620), ngon(120))],
    5: [("ellipsoid 300 x 200", (550, 300, 850, 500), ngon(150, 100))],
    6: [("hexagon r=150", (770, -550, 1030, -250), 3 * math.sqrt(3) / 2 * 150**2)],
    7: [("triangle", (15, 785, 215, 1015), 200 * 230 / 2)],
}

layout = kdb.Layout()
layout.read(str(HERE / "design.gds"))
checks = 0

def ok(condition, label):
    global checks
    if not condition:
        raise SystemExit("FAILED: " + label)
    checks += 1

ok(abs(layout.dbu - 0.001) < 1e-12, f"database unit is 1 nm (got {layout.dbu} um)")
ok(layout.top_cell().name == "elyvris_studio", "cell name")
found = sorted((layout.get_info(i).layer, layout.get_info(i).datatype) for i in layout.layer_indexes())
ok(found == [(n, 0) for n in sorted(EXPECTED)], f"layers 1/0 to 7/0 (got {found})")

top = layout.top_cell()
for number, shapes in EXPECTED.items():
    polygons = sorted((s.polygon for s in top.shapes(layout.layer(number, 0)).each()), key=lambda p: p.bbox().left)
    shapes = sorted(shapes, key=lambda s: s[1][0])
    ok(len(polygons) == len(shapes), f"layer {number}: {len(shapes)} outline(s)")
    for polygon, (what, box, area) in zip(polygons, shapes):
        b = polygon.bbox()
        ok((b.left, b.bottom, b.right, b.top) == box, f"layer {number} {what}: box {(b.left, b.bottom, b.right, b.top)} vs {box}")
        # Rounding corners to the grid moves each edge by at most 0.5 nm.
        ok(abs(polygon.area() - area) <= 0.5 * polygon.perimeter(), f"layer {number} {what}: area {polygon.area()} vs {area:.1f}")
        print(f"layer {number}/0  {what:26s} area {polygon.area():>9.0f} nm2  (formula {area:>11.1f}, difference {100 * (polygon.area() - area) / area:+.3f} %)")

# 3. The same layout as gdsfactory builds from the Studio's script.
start = os.getcwd()
with tempfile.TemporaryDirectory() as folder:
    os.chdir(folder)
    try:
        runpy.run_path(str(HERE / "design_layout.py"))
        reference = kdb.Layout()
        reference.read("elyvris_studio.gds")
    finally:
        os.chdir(start)
import gdsfactory

rtop = reference.top_cell()
for number in EXPECTED:
    ours = kdb.Region(top.begin_shapes_rec(layout.layer(number, 0)))
    theirs = kdb.Region(rtop.begin_shapes_rec(reference.layer(number, 0)))
    scale = (layout.dbu / reference.dbu) ** 2
    differ = (ours ^ theirs).area() * layout.dbu**2 if abs(layout.dbu - reference.dbu) < 1e-12 else None
    ok(differ is not None, "same database unit as gdsfactory")
    total = theirs.area() * reference.dbu**2
    ok(total > 0 and differ <= 0.005 * total, f"layer {number}: differs from gdsfactory by {differ} um2 of {total} um2")
    print(f"layer {number}/0  XOR with gdsfactory {gdsfactory.__version__}: {differ * 1e6:.0f} nm2 of {total * 1e6:.0f} nm2 ({100 * differ / total:.3f} %)")

print(f"klayout {kdb.__version__}: {checks} checks passed.")
