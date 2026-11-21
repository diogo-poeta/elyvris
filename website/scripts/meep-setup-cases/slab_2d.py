# A 2D cell (z size 0) with PML on the x walls only, and the default metal walls (no k_point).
import meep as mp

sx, sy = 6, 4
pml_layers = [mp.PML(thickness=1.0, direction=mp.X, side=mp.ALL)]

sim = mp.Simulation(
    cell_size=mp.Vector3(sx, sy, 0),
    boundary_layers=pml_layers,
    geometry=[mp.Block(size=mp.Vector3(mp.inf, 0.5, mp.inf), material=mp.Medium(epsilon=12))],
    resolution=10,
)
sim.run(until=1)
