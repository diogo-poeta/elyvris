# Ring resonator next to a straight waveguide, written the way the Meep tutorials do:
# the geometry goes into mp.Simulation together with sources and boundary layers.
import meep as mp

n = 3.4
w = 1.0
r = 1.0
pad = 4
dpml = 2
sxy = 2 * (r + w + pad + dpml)

c1 = mp.Cylinder(radius=r + w, material=mp.Medium(index=n))
c2 = mp.Cylinder(radius=r)
bus = mp.Block(size=mp.Vector3(mp.inf, w, mp.inf), center=mp.Vector3(0, -(r + w + 0.2 + w / 2)), material=mp.Medium(index=n))
unused = mp.Sphere(radius=0.5)      # made, but not given to the simulation

fcen = 0.15
df = 0.1
src = mp.Source(mp.GaussianSource(fcen, fwidth=df), mp.Ez, mp.Vector3(r + 0.1))

sim = mp.Simulation(
    cell_size=mp.Vector3(sxy, sxy),
    geometry=[c1, c2, bus],
    sources=[src],
    resolution=10,
    boundary_layers=[mp.PML(dpml)],
)
sim.run(until=1)
