"""Check the published S2 timing table against an independent transcription.

Run without arguments beside anapole-temporal-samples.json, or pass --data.
The source-development prepared/ layout is also supported.
"""
from __future__ import annotations

import argparse
from decimal import Decimal
import json
from pathlib import Path
import statistics

EXPECTED = [
    (1, "8.36", "8.63", ".733"), (1, "8.42", "8.68", ".745"), (1, "8.47", "8.73", ".645"),
    (2, "8.89", "9.20", ".543"), (2, "8.94", "9.26", ".678"), (2, "9.00", "9.31", ".716"), (2, "9.05", "9.36", ".649"),
    (3, "9.47", "9.78", ".433"), (3, "9.52", "9.84", ".580"), (3, "9.57", "9.89", ".651"), (3, "9.63", "9.94", ".625"),
    (4, "10.15", "10.41", ".554"), (4, "10.20", "10.47", ".564"), (4, "10.26", "10.52", ".495"),
]


def default_data_path() -> Path:
    base = Path(__file__).resolve().parent
    adjacent = base / "anapole-temporal-samples.json"
    return adjacent if adjacent.is_file() else base / "prepared" / "anapole-temporal-samples.json"


def check(path: Path) -> dict:
    source = json.loads(path.read_text(encoding="utf-8-sig"))
    if source.get("schemaVersion") != 1 or len(source.get("samples", [])) != len(EXPECTED):
        raise ValueError("Expected schema version 1 and exactly 14 source rows")
    delays = []
    for row, (actual, (instance, electric, magnetic, intensity)) in enumerate(zip(source["samples"], EXPECTED), 1):
        expected = (instance, Decimal(electric), Decimal(magnetic), Decimal(intensity))
        found = (actual["instance"], Decimal(str(actual["electricTimeFs"])), Decimal(str(actual["magneticTimeFs"])), Decimal(str(actual["electricIntensity"])))
        delay = Decimal(magnetic) - Decimal(electric)
        if found != expected or Decimal(str(actual["delayFs"])) != delay:
            raise ValueError(f"Source row {row} differs from the independent transcription")
        delays.append(float(delay))
    period = 366.5 / 299.792458
    return {
        "status": "passed", "rows": len(EXPECTED),
        "delayRangeFs": [min(delays), max(delays)],
        "meanDelayFs": statistics.mean(delays), "medianDelayFs": statistics.median(delays),
        "comparisonWavelengthNm": 366.5, "comparisonPeriodFs": period, "quarterPeriodFs": period / 4,
        "scope": "Paired reported event times; not simultaneous field maps, recovered complex phases, or a stand-alone anapole identification.",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=default_data_path(), help="S2 JSON table (default: adjacent file, then prepared/ fallback)")
    args = parser.parse_args()
    try:
        output = check(args.data)
    except (OSError, ValueError, KeyError, TypeError) as error:
        parser.exit(1, f"Timing check failed: {error}\n")
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
