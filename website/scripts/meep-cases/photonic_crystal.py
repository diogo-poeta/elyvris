# Silicon slab with a triangular lattice of air holes and a line defect (one row left out).
import meep as mp
from math import sqrt

a = 0.42
r = 0.3 * a
h = 0.22
rows, cols = 5, 7

geometry = [mp.Block(mp.Vector3(cols * a, rows * a * sqrt(3) / 2, h), center=mp.Vector3(), material=mp.Medium(epsilon=12))]
for row in range(-(rows // 2), rows // 2 + 1):
    if row == 0:
        continue                       # the line defect
    shift = a / 2 if row % 2 else 0
    for col in range(-(cols // 2), cols // 2 + 1):
        x = col * a + shift
        if abs(x) > cols * a / 2 - r:
            continue
        geometry.append(mp.Cylinder(r, height=h, center=mp.Vector3(x, row * a * sqrt(3) / 2), material=mp.air))
