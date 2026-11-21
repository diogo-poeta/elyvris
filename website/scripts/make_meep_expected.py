"""Ask the real Meep what each test script in meep-cases/ builds.
Run with a Python that has Meep:  python make_meep_expected.py
"""
import json
import math
import runpy
from pathlib import Path

import meep as mp

HERE = Path(__file__).resolve().parent / "meep-cases"
captured = []
RealSimulation = mp.Simulation

class RecordingSimulation(RealSimulation):
    def __init__(self, *args, **kwargs):
        captured.append(kwargs.get("geometry"))
        super().__init__(*args, **kwargs)

    def run(self, *args, **kwargs):
        return None

mp.Simulation = RecordingSimulation

def number(value):
    """Meep stores 'infinite' as 1e20; JSON has no infinity, so write the word."""
    value = float(value)
    return "inf" if abs(value) >= 1e19 else value

def vector(v):
    return [number(v.x), number(v.y), number(v.z)]

def describe(obj):
    out = {"kind": type(obj).__name__}
    eps = obj.material.epsilon_diag
    out["n"] = math.sqrt(eps.x)
    if isinstance(obj, mp.Prism):
        out["vertices"] = [vector(v) for v in obj.vertices]
        out["height"] = number(obj.height)
        return out
    out["center"] = vector(obj.center)
    if isinstance(obj, mp.Sphere):
        out["radius"] = number(obj.radius)
    elif isinstance(obj, mp.Cylinder):          # Cone is a kind of Cylinder
        out["radius"] = number(obj.radius)
        out["height"] = number(obj.height)
        out["axis"] = vector(obj.axis)
        if isinstance(obj, mp.Cone):
            out["radius2"] = number(obj.radius2)
    elif isinstance(obj, mp.Block):             # Ellipsoid is a kind of Block
        out["size"] = vector(obj.size)
    return out

cases = {}
for path in sorted(HERE.glob("*.py")):
    captured.clear()
    scope = runpy.run_path(str(path))
    geometry = captured[-1] if captured else scope.get("geometry")
    cases[path.name] = [describe(obj) for obj in geometry]
    print(f"{path.name}: {len(cases[path.name])} objects")

result = {"meep": mp.__version__, "cases": cases}
(HERE / "expected.json").write_text(json.dumps(result, indent=1) + "\n", encoding="utf-8")
print("meep", mp.__version__, "- wrote", HERE / "expected.json")
