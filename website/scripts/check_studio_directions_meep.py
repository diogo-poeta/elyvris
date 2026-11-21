"""Measure, with real Meep runs, which way each kind of source sends power and what sign a flux plane gives.
Run with a Python that has Meep:  python check_studio_directions_meep.py
"""
import json
import runpy
from pathlib import Path

import meep as mp

HERE = Path(__file__).resolve().parent / "meep-setup-cases"
RealSimulation = mp.Simulation
monitors = []

class RecordingSimulation(RealSimulation):
    def add_flux(self, *args, **kwargs):
        flux = super().add_flux(*args, **kwargs)
        monitors.append(flux)
        return flux

mp.Simulation = RecordingSimulation
cases = {}
for path in sorted(HERE.glob("dir_*.py")):
    monitors.clear()
    runpy.run_path(str(path))
    fluxes = [float(mp.get_fluxes(m)[0]) for m in monitors]
    cases[path.name] = {"fluxes": fluxes}
    print(f"{path.name}: flux at x = -3 and x = +3: {fluxes}")

out = HERE / "directions.json"
out.write_text(json.dumps({"meep": mp.__version__, "cases": cases}, indent=1) + "\n", encoding="utf-8")
print("meep", mp.__version__, "- wrote", out)
