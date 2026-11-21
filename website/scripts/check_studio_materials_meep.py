"""Check with the real Meep that the Studio keeps the meaning of a script's materials.
Run it with a Python that has Meep installed:  python check_studio_materials_meep.py
"""
import cmath
import json
import pathlib

import meep as mp

HERE = pathlib.Path(__file__).resolve().parent
CASES = json.loads((HERE / "meep-cases" / "materials.json").read_text(encoding="utf-8"))["cases"]
WAVELENGTHS_UM = [0.4, 0.633, 1.55]
REL_TOL = 1e-9

def geometry_of(code):
    """Run a Meep script in a fresh namespace and return its geometry list."""
    namespace = {}
    exec(compile(code, "<script>", "exec"), namespace)
    return namespace["geometry"]

def epsilon_table(geometry, scale=1.0):
    """epsilon at each object's centre, for each wavelength, from a full Meep simulation setup,
    then epsilon of each object's material by itself. The second also holds the loss of a
    conductivity (D_conductivity), which get_epsilon_point leaves out.
    `scale` is the length unit in micrometres. The last rows are each object's place and size in um."""
    sim = mp.Simulation(cell_size=mp.Vector3(1.6, 0.8, 0.8) / scale, resolution=20 * scale, geometry=geometry)
    sim.init_sim()
    table = [[complex(sim.get_epsilon_point(obj.center, frequency=scale / wl)) for wl in WAVELENGTHS_UM]
             for obj in geometry]
    sim.reset_meep()
    table += [[material_epsilon(obj.material, scale / wl) for wl in WAVELENGTHS_UM] for obj in geometry]
    table += [[complex(v * scale) for v in (obj.center.x, obj.center.y, obj.center.z, getattr(obj, "radius", 0))
               + tuple(getattr(obj, "size", mp.Vector3()))] for obj in geometry]
    return table

def material_epsilon(material, frequency):
    """Medium.epsilon(f), or None where Meep refuses: outside the material's valid range
    (for example meep.materials.Si, a fit valid only for 1.36-11 um)."""
    try:
        return complex(material.epsilon(frequency)[0, 0])
    except ValueError:
        return None

def same_value(a, b):
    if a is None or b is None:
        return a is b
    if cmath.isinf(a) or cmath.isinf(b) or cmath.isnan(a) or cmath.isnan(b):
        return repr(a) == repr(b)
    return abs(a - b) <= REL_TOL * max(1.0, abs(a), abs(b))

def same_table(a, b):
    return len(a) == len(b) and all(same_value(x, y) for row_a, row_b in zip(a, b) for x, y in zip(row_a, row_b))

def show(table):
    return "; ".join(", ".join("out of range" if e is None else f"{e.real:.4g}{e.imag:+.3g}j" for e in row) for row in table)

failures = []
print(f"meep {mp.__version__}; epsilon at object centres for wavelengths {WAVELENGTHS_UM} um")
for name, case in CASES.items():
    original = epsilon_table(geometry_of(case["original"]))
    rewritten_code = case["rewritten"]

    if "needs" in case:
        # Copied alone, the definition must fail loudly (not silently change the material) ...
        try:
            geometry_of(rewritten_code)
            failures.append(f"{name}: rewritten code ran without {case['needs'].strip()!r}")
            print(f"FAIL {name}: expected a NameError for the missing variable")
        except NameError as error:
            print(f"ok   {name}: alone, the rewritten code stops with: {error}")
        # ... and once the user copies the variable as the note says, it must be the same material.
        rewritten_code = rewritten_code.replace("import meep as mp\n", "import meep as mp\n" + case["needs"], 1)

    scale = case.get("scale", 1.0)
    rewritten = epsilon_table(geometry_of(rewritten_code), scale)
    if same_table(original, rewritten):
        print(f"ok   {name}: same epsilon  [{show(original)}]")
    else:
        failures.append(name)
        print(f"FAIL {name}: original [{show(original)}] vs rewritten [{show(rewritten)}]")

    if "before_fix" in case:
        before = epsilon_table(geometry_of(case["before_fix"]), scale)
        if same_table(original, before):
            failures.append(name + " (before_fix)")
            print(f"FAIL {name}: the old output was not detected as different")
        else:
            print(f"ok   {name}: the old output is detected as different  [{show(before)}]")

print("ALL PASSED" if not failures else f"{len(failures)} FAILED: {failures}")
raise SystemExit(1 if failures else 0)
