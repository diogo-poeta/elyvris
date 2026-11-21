"""Print the valid wavelength range of every material in Meep's own library (meep.materials).
Run it with a Python that has Meep installed and paste the output into studio-code.js
"""
import json

import meep as mp
from meep import materials

ranges = {}
for name in sorted(vars(materials)):
    medium = getattr(materials, name)
    if not isinstance(medium, mp.Medium) or name.startswith("_"):
        continue
    low, high = medium.valid_freq_range.min, medium.valid_freq_range.max
    if not (0 < high < 1e20):
        continue  # no stated range
    ranges[name] = [round(1 / high, 4), round(1 / low, 4) if low > 0 else None]

print(f"// meep.materials {mp.__version__}: valid wavelength range in um [shortest, longest]")
print(json.dumps(ranges, separators=(", ", ": ")))
