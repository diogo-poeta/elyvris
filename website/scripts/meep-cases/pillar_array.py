# A 3 x 4 array of TiO2 pillars on a glass substrate. Lengths in micrometres.
import meep as mp

period = 0.45          # centre-to-centre distance
radius = 0.11
height = 0.25
nx, ny = 3, 4

TiO2 = mp.Medium(index=2.4)
glass = mp.Medium(index=1.45)

geometry = [mp.Block(size=mp.Vector3(mp.inf, mp.inf, 0.5),
                     center=mp.Vector3(0, 0, -0.25),
                     material=glass)]

for i in range(nx):
    for j in range(ny):
        x = (i - (nx - 1) / 2) * period
        y = (j - (ny - 1) / 2) * period
        geometry.append(
            mp.Cylinder(radius=radius, height=height,
                        center=mp.Vector3(x, y, height / 2),
                        material=TiO2)
        )
