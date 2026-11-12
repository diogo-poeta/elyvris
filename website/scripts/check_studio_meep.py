"""Check that the Meep code written by Elyvris Studio means what the 3D view draws.

The geometry list below was produced by the Studio page for a test design with
one shape of every kind. Meep is asked which object contains each test point.
Run it with a Python that has Meep installed:  python check_studio_meep.py
"""
import meep as mp

SiO2 = mp.Medium(index=1.457)
Si = mp.Medium(index=3.874)
TiO2 = mp.Medium(index=2.389)
Au = mp.Medium(index=1.2)   # stand-in for the test only
Al = mp.Medium(index=1.3)   # stand-in for the test only
MgF2 = mp.Medium(index=1.421)
my_glass = mp.Medium(index=1.9)
BK7 = mp.Medium(index=1.515)

geometry = [
    mp.Block(size=mp.Vector3(mp.inf, mp.inf, 0.5), center=mp.Vector3(0, 0, -0.25), material=SiO2),
    mp.Sphere(radius=0.09, center=mp.Vector3(-0.3, 0.12, 0.09), material=Si),
    mp.Cylinder(radius=0.15, height=0.2, axis=mp.Vector3(0, 0, 1), center=mp.Vector3(0.4, 0, 0.1), material=TiO2),
    mp.Cylinder(radius=0.04, height=0.6, axis=mp.Vector3(1, 0, 0), center=mp.Vector3(0, -0.5, 0.04), material=Au),
    mp.Cone(radius=0.12, radius2=0.03, height=0.25, axis=mp.Vector3(0, 0, 1), center=mp.Vector3(0, 0.5, 0.125), material=Al),
    mp.Ellipsoid(size=mp.Vector3(0.3, 0.2, 0.15), center=mp.Vector3(0.7, 0.4, 0.075), material=MgF2),
    mp.Cylinder(radius=0.4, height=0.15, axis=mp.Vector3(0, 0, 1), center=mp.Vector3(-0.9, 0, 0.075), material=Si),
    mp.Cylinder(radius=0.3, height=0.15, axis=mp.Vector3(0, 0, 1), center=mp.Vector3(-0.9, 0, 0.075), material=mp.air),  # hole of the ring
    mp.Prism(vertices=[mp.Vector3(0.9, -0.25, 0), mp.Vector3(0.7700961894, -0.325, 0), mp.Vector3(0.7700961894, -0.475, 0), mp.Vector3(0.9, -0.55, 0), mp.Vector3(1.029903811, -0.475, 0), mp.Vector3(1.029903811, -0.325, 0)], height=0.12, axis=mp.Vector3(0, 0, 1), material=my_glass),
    mp.Prism(vertices=[mp.Vector3(0.015, 0.9, 0), mp.Vector3(0.215, 0.785, 0), mp.Vector3(0.215, 1.015, 0)], height=0.04, axis=mp.Vector3(0, 0, 1), material=BK7),
]
print("meep", mp.__version__, "- objects:", len(geometry))

# Expected material at chosen points, as the Studio's 3D view draws them.
# Later objects win where they overlap (Meep rule), so the ring hole is air.
POINTS = [
    ("substrate inside",            (0.0, 0.0, -0.25),      1.457),
    ("substrate: far sideways",     (40.0, -30.0, -0.25),   1.457),
    ("just above substrate",        (0.0, 0.0, 0.05),       1.0),
    ("sphere centre",               (-0.3, 0.12, 0.09),     3.874),
    ("sphere: outside, above",      (-0.3, 0.12, 0.20),     1.0),
    ("standing cylinder centre",    (0.4, 0.0, 0.1),        2.389),
    ("standing cylinder: above",    (0.4, 0.0, 0.23),       1.0),
    ("lying cylinder near x end",   (0.27, -0.5, 0.04),     1.2),
    ("lying cylinder: past x end",  (0.33, -0.5, 0.04),     1.0),
    ("lying cylinder: off in y",    (0.0, -0.56, 0.04),     1.0),
    ("cone: wide at the bottom",    (0.08, 0.5, 0.03),      1.3),
    ("cone: narrow at the top",     (0.08, 0.5, 0.22),      1.0),
    ("cone: axis near the top",     (0.0, 0.5, 0.22),       1.3),
    ("ellipsoid along x",           (0.83, 0.4, 0.075),     1.421),
    ("ellipsoid: outside along y",  (0.7, 0.53, 0.075),     1.0),
    ("ring wall",                   (-0.55, 0.0, 0.075),    3.874),
    ("ring hole",                   (-0.9, 0.0, 0.075),     1.0),
    ("ring: outside",               (-0.45, 0.0, 0.075),    1.0),
    ("hexagon prism centre",        (0.9, -0.4, 0.06),      1.9),
    ("hexagon prism: above top",    (0.9, -0.4, 0.14),      1.0),
    ("hexagon prism: corner side",  (0.9, -0.26, 0.06),     1.9),
    ("hexagon prism: flat side out",(1.04, -0.4, 0.06),     1.0),
    ("triangle prism inside",       (0.15, 0.9, 0.02),      1.515),
    ("triangle prism: beside tip",  (0.05, 0.95, 0.02),     1.0),
    ("triangle prism: above",       (0.15, 0.9, 0.06),      1.0),
]


def index_at(point):
    """Material index at a point: the last object in the list that contains it."""
    p = mp.Vector3(*point)
    for obj in reversed(geometry):
        if mp.is_point_in_object(p, obj):
            return obj.material.epsilon_diag.x ** 0.5
    return 1.0


failed = 0
for name, point, expected in POINTS:
    got = index_at(point)
    ok = abs(got - expected) < 1e-9
    failed += not ok
    print(("ok   " if ok else "FAIL ") + f"{name:30s} {str(point):26s} index {got:.3f} (expected {expected})")

# The names suggested for metals: do they exist in Meep's own material library?
try:
    from meep.materials import Au as LibAu, Al as LibAl  # noqa: F401
    print("meep.materials has Au and Al")
except Exception as error:  # pragma: no cover
    print("meep.materials import problem:", error)

# Finally let Meep build the structure once (small grid, no run).
sim = mp.Simulation(cell_size=mp.Vector3(2.4, 2.4, 1.2), geometry=geometry, resolution=20, eps_averaging=False)
sim.init_sim()
print("Simulation initialised with this geometry.")
print("RESULT:", "all points agree" if not failed else f"{failed} point(s) disagree")
