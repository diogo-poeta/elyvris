# A plane of current (mp.Source with a size): it also radiates to both sides.
# A 2D cell (z size 0) with PML. Two flux planes, at x = -3 and x = +3, count the power that
# leaves the source to each side. check_studio_directions_meep.py runs it and records the fluxes.
import meep as mp

dpml = 1
cell = mp.Vector3(10, 4, 0)
fcen, df = 0.65, 0.2
geometry = []
sources = [mp.Source(mp.GaussianSource(fcen, fwidth=df), component=mp.Ez, center=mp.Vector3(), size=mp.Vector3(0, 2))]

sim = mp.Simulation(cell_size=cell, boundary_layers=[mp.PML(dpml)], geometry=geometry, sources=sources, resolution=20)
left = sim.add_flux(fcen, df, 1, mp.FluxRegion(center=mp.Vector3(-3, 0), size=mp.Vector3(0, 2)))
right = sim.add_flux(fcen, df, 1, mp.FluxRegion(center=mp.Vector3(3, 0), size=mp.Vector3(0, 2)))
sim.run(until_after_sources=60)
