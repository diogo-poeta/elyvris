"""Ask the real Meep how it sets up the cell, boundary layers, sources and monitors of each test script.
Run with a Python that has Meep:  python make_meep_setup_expected.py
"""
import json
import runpy
from pathlib import Path

import meep as mp

SCRIPTS = Path(__file__).resolve().parent
CASES = [SCRIPTS / "meep-cases" / "ring_simulation.py"] + sorted((SCRIPTS / "meep-setup-cases").glob("*.py"))
made = []
regions = []
RealSimulation = mp.Simulation

class RecordingSimulation(RealSimulation):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        made.append(self)

    def run(self, *args, **kwargs):
        return None

    def add_flux(self, *args, **kwargs):
        regions.extend(("flux", r) for r in args if isinstance(r, mp.FluxRegion))
        return super().add_flux(*args, **kwargs)

    def add_mode_monitor(self, *args, **kwargs):
        regions.extend(("mode", r) for r in args if isinstance(r, mp.FluxRegion))
        return super().add_mode_monitor(*args, **kwargs)

mp.Simulation = RecordingSimulation

def vector(v):
    return [float(v.x), float(v.y), float(v.z)]

COMPONENTS = {getattr(mp, name): name for name in ["Ex", "Ey", "Ez", "Hx", "Hy", "Hz"]}

def describe_source(src):
    out = {"kind": type(src).__name__, "center": vector(src.center), "size": vector(src.size)}
    if isinstance(src, mp.EigenModeSource):
        out["direction"] = int(src.direction)
        out["eig_kpoint"] = vector(src.eig_kpoint)
    elif isinstance(src, mp.GaussianBeamSource):
        out["beam_kdir"] = vector(src._beam_kdir)
        out["beam_E0"] = [float(abs(c)) for c in (src._beam_E0.x, src._beam_E0.y, src._beam_E0.z)]
    else:
        out["component"] = COMPONENTS.get(src.component, str(src.component))
    return out

def describe_region(kind, region):
    return {"kind": kind, "center": vector(region.center), "size": vector(region.size),
            "direction": int(region.direction), "weight": complex(region.weight).real}

def describe(sim):
    sim.init_sim()   # Meep decides the number of dimensions here
    layers = []
    for layer in sim.boundary_layers:
        layers.append({
            "kind": "Absorber" if isinstance(layer, mp.Absorber) else "PML",
            "thickness": float(layer.thickness),
            "direction": int(layer.direction),
            "side": int(layer.side),
        })
    return {
        "cell": vector(sim.cell_size),
        "center": vector(sim.geometry_center),
        "dimensions": int(sim.dimensions),
        "resolution": float(sim.resolution),
        "layers": layers,
        "walls": "periodic" if sim.k_point else "metal",
        "kPoint": vector(sim.k_point) if sim.k_point else None,
        "sources": [describe_source(src) for src in sim.sources],
        "monitors": [describe_region(kind, r) for kind, r in regions],
    }

cases = {}
for path in CASES:
    made.clear()
    regions.clear()
    runpy.run_path(str(path))
    cases[path.name] = describe(made[-1])
    print(f"{path.name}: {cases[path.name]}")

result = {"meep": mp.__version__, "cases": cases}
out = SCRIPTS / "meep-setup-cases" / "setup.json"
out.write_text(json.dumps(result, indent=1) + "\n", encoding="utf-8")
print("meep", mp.__version__, "- wrote", out)
