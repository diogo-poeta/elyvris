# Elyvris Studio: gdsfactory layout, seen from above. Units: micrometres.
# Layers: (1, 0) Si | (2, 0) TiO2 | (3, 0) Au | (4, 0) Al | (5, 0) MgF2 | (6, 0) my_glass n=1.9 | (7, 0) BK7
import gdsfactory as gf

gf.gpdk.PDK.activate()
c = gf.Component(name="elyvris_studio")

# s1: box with an infinite size is not a layout shape (skipped)
s2 = c.add_ref(gf.components.circle(radius=0.09, layer=(1, 0)))  # sphere h=180nm z=90nm
s2.move((-0.3, 0.12))
s3 = c.add_ref(gf.components.circle(radius=0.15, layer=(2, 0)))  # cylinder h=200nm z=100nm
s3.move((0.4, 0))
c.add_polygon([(-0.3, -0.54), (0.3, -0.54), (0.3, -0.46), (-0.3, -0.46)], layer=(3, 0))  # cylinder h=80nm z=40nm
s5 = c.add_ref(gf.components.circle(radius=0.12, layer=(4, 0)))  # cone h=250nm z=125nm r2=30nm
s5.move((0, 0.5))
s6 = c.add_ref(gf.components.ellipse(radii=(0.15, 0.1), layer=(5, 0)))  # ellipsoid h=150nm z=75nm
s6.move((0.7, 0.4))
s7 = c.add_ref(gf.components.ring(radius=0.35, width=0.1, layer=(1, 0)))  # ring h=150nm z=75nm
s7.move((-0.9, 0))
c.add_polygon([(0.9, -0.25), (0.7700961894, -0.325), (0.7700961894, -0.475), (0.9, -0.55), (1.029903811, -0.475), (1.029903811, -0.325)], layer=(6, 0))  # prism h=120nm z=60nm
c.add_polygon([(0.015, 0.9), (0.215, 0.785), (0.215, 1.015)], layer=(7, 0))  # prism h=40nm z=20nm

c.write_gds("elyvris_studio.gds")  # open this file in KLayout
