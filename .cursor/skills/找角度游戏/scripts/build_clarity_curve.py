#!/usr/bin/env python3
"""Build clarity curve and optional angle-feasibility from gaussian-metadata.json."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _skill_utils import (
    SCHEMAS_DIR,
    SIGMA_BY_DIFFICULTY,
    build_clarity_samples,
    evaluate_feasibility,
    infer_canonical_angles,
    load_json,
    save_json,
    validate_schema_minimal,
)


def build_curve(metadata: dict, difficulty: str) -> dict:
    peak_yaw, peak_pitch, source = infer_canonical_angles(metadata)
    sigma = SIGMA_BY_DIFFICULTY.get(difficulty, SIGMA_BY_DIFFICULTY["normal"])
    view_dep = float(metadata.get("viewDependenceScore", 0.7))
    sigma_effective = sigma / max(0.3, view_dep)

    samples = build_clarity_samples(peak_yaw, peak_pitch, sigma_effective)
    peak_sample = max(samples, key=lambda s: s["clarity"])

    return {
        "version": "1.0",
        "difficulty": difficulty,
        "sigmaRadians": round(sigma_effective, 4),
        "peak": {
            "yawDegrees": peak_sample["yawDegrees"],
            "pitchDegrees": peak_sample["pitchDegrees"],
            "clarity": peak_sample["clarity"],
        },
        "samples": samples,
        "canonicalSource": source,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build clarity curve from Gaussian metadata")
    parser.add_argument("metadata", type=Path, help="gaussian-metadata.json path")
    parser.add_argument("-o", "--output", type=Path, help="Output clarity-curve.json")
    parser.add_argument("--difficulty", default="normal", choices=["easy", "normal", "hard"])
    parser.add_argument("--feasibility-only", action="store_true")
    parser.add_argument("--feasibility-output", type=Path)
    args = parser.parse_args()

    metadata = load_json(args.metadata)
    meta_errors = validate_schema_minimal(metadata, SCHEMAS_DIR / "gaussian-metadata.schema.json")
    if meta_errors:
        for e in meta_errors:
            print(f"WARN: {e}", file=sys.stderr)

    curve = build_curve(metadata, args.difficulty)
    feasibility = evaluate_feasibility(metadata, curve["samples"])

    if args.feasibility_only:
        out = args.feasibility_output or args.metadata.parent / "angle-feasibility.json"
        save_json(out, feasibility)
        print(f"Wrote {out} suitable={feasibility['suitable']} mode={feasibility['recommendedMode']}")
        return 0

    out = args.output or args.metadata.parent / "clarity-curve.json"
    save_json(out, curve)

    feas_path = args.metadata.parent / "angle-feasibility.json"
    save_json(feas_path, feasibility)

    errors = validate_schema_minimal(curve, SCHEMAS_DIR / "clarity-curve.schema.json")
    if errors:
        for e in errors:
            print(f"ERROR: {e}", file=sys.stderr)
        return 1

    print(f"Wrote {out} ({len(curve['samples'])} samples)")
    print(f"Wrote {feas_path} suitable={feasibility['suitable']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
