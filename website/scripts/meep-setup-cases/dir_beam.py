# A Gaussian beam source with beam_kdir along +x.
# A 2D cell (z size 0) with PML. Two flux planes, at x = -3 and x = +3, count the power that
# leaves the source to each side. check_studio_directions_meep.py runs it and records the fluxes.
import meep as mp

dpml = 1
cell = mp.Vector3(10, 4, 0)
fcen, df = 0.65, 0.2
geometry = []
sources = [mp.GaussianBeamSource(mp.GaussianSource(fcen, fwidth=df), center=mp.Vector3(), size=mp.Vector3(0, 2),
                                  beam_x0=mp.Vector3(), beam_kdir=mp.Vector3(1, 0, 0), beam_w0=0.8, beam_E0=mp.Vector3(0, 0, 1))]

sim = mp.Simulation(cell_size=cell, boundary_layers=[mp.PML(dpml)], geometry=geometry, sources=sources, resolution=20)
left = sim.add_flux(fcen, df, 1, mp.FluxRegion(center=mp.Vector3(-3, 0), size=mp.Vector3(0, 2)))
right = sim.add_flux(fcen, df, 1, mp.FluxRegion(center=mp.Vector3(3, 0), size=mp.Vector3(0, 2)))
sim.run(until_after_sources=60)
