# A gold bowtie made of two prisms, a cone tip, and a lying cylinder.
import meep as mp
import numpy as np

gap = 0.03
side = 0.2
t = 0.04
Au = mp.Medium(index=1.2)      # placeholder: gold needs a dispersive model

tip = mp.Vector3(gap / 2, 0, 0)
back = side * np.cos(np.radians(30))
tri = [tip, tip + mp.Vector3(back, side / 2), tip + mp.Vector3(back, -side / 2)]
left = [mp.Vector3(-v.x, v.y, v.z) for v in tri]

geometry = []
for k, verts in enumerate([tri, left]):
    geometry.append(mp.Prism(verts, t, material=Au))

pos, rad = (0, 0.5), 0.08
geometry.append(mp.Cone(radius=rad, radius2=0.01 if rad > 0.05 else 0, height=0.3,
                        center=mp.Vector3(pos[0], pos[1], 0.15), material=mp.Medium(index=2.0)))
geometry.append(mp.Cylinder(radius=0.03, height=0.8, axis=mp.Vector3(1, 0, 0), center=mp.Vector3(0, -0.5, 0.03), material=Au))
for x, y in zip([-0.4, 0.4], [0.2, -0.2]):
    geometry.append(mp.Block(size=mp.Vector3(0.1, 0.1, 0.1) * 2, center=mp.Vector3(x, y, 0.1), material=mp.Medium(index=1.5)))
