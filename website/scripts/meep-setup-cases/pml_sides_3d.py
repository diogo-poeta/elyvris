# A 3D cell moved away from the origin, a PML on one wall only and an absorber on two,
# with Bloch-periodic walls (k_point). Only the setup matters here; nothing is run.
import meep as mp

cell = mp.Vector3(4, 3, 2)
shift = mp.Vector3(1, 0, 0)
dpml = 0.5

sim = mp.Simulation(
    cell_size=cell,
    geometry_center=shift,
    geometry=[mp.Block(size=mp.Vector3(1, 1, 0.2), center=shift, material=mp.Medium(index=2))],
    boundary_layers=[mp.PML(dpml, direction=mp.Y, side=mp.High), mp.Absorber(1, mp.X)],
    k_point=mp.Vector3(0.1),
    resolution=20,
)
sim.run(until=1)
