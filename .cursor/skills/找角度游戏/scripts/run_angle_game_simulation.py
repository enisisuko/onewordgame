#!/usr/bin/env python3
"""Run three mock angle-finder game simulations end-to-end."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _skill_utils import (
    MOCK_METADATA,
    SCHEMAS_DIR,
    SIMULATION_CASES,
    SIGMA_BY_DIFFICULTY,
    angular_distance_deg,
    build_clarity_samples,
    build_game_spec_from_recipe,
    clarity_from_angle_deg,
    evaluate_feasibility,
    infer_canonical_angles,
    save_json,
    spherical_to_dir,
    validate_schema_minimal,
)
from build_clarity_curve import build_curve


def simulate_case(case_id: str, metadata_key: str, difficulty: str) -> dict:
    metadata = MOCK_METADATA[metadata_key]
    curve = build_curve(metadata, difficulty)
    feasibility = evaluate_feasibility(metadata, curve["samples"])
    game_spec = build_game_spec_from_recipe(metadata, feasibility, difficulty)

    peak_yaw, peak_pitch, _ = infer_canonical_angles(metadata)
    sigma = SIGMA_BY_DIFFICULTY[difficulty]
    view_dep = float(metadata.get("viewDependenceScore", 0.7))
    sigma_eff = sigma / max(0.3, view_dep)

    peak_dir = spherical_to_dir(peak_yaw, peak_pitch)
    start_yaw = peak_yaw + (60 if difficulty == "easy" else 120 if difficulty == "normal" else 150)
    start_dir = spherical_to_dir(start_yaw, peak_pitch + 20)
    start_theta = angular_distance_deg(start_dir, peak_dir)
    start_clarity = clarity_from_angle_deg(start_theta, sigma_eff)
    peak_clarity = clarity_from_angle_deg(0, sigma_eff)

    win_threshold = game_spec["clarityConfig"]["winThreshold"]
    player_finds_angle = peak_clarity >= win_threshold

    expects_fallback = metadata_key == "sphere_symmetric"
    fallback_ok = (not feasibility["suitable"]) == expects_fallback

    spec_errors = validate_schema_minimal(game_spec, SCHEMAS_DIR / "angle-game-spec.schema.json")
    passed = (
        not spec_errors
        and player_finds_angle
        and fallback_ok
        and start_clarity < peak_clarity
    )

    return {
        "caseId": case_id,
        "metadataKey": metadata_key,
        "difficulty": difficulty,
        "targetLabel": metadata["targetLabel"],
        "feasibility": feasibility,
        "startClarity": round(start_clarity, 3),
        "peakClarity": round(peak_clarity, 3),
        "winThreshold": win_threshold,
        "fallbackMode": game_spec.get("fallbackMode"),
        "gameSpecValid": not spec_errors,
        "validationErrors": spec_errors,
        "passed": passed,
    }


def main() -> int:
    out_dir = Path(__file__).resolve().parent.parent / "test-results"
    out_dir.mkdir(parents=True, exist_ok=True)

    results = [simulate_case(cid, key, diff) for cid, key, diff in SIMULATION_CASES]
    all_passed = all(r["passed"] for r in results)

    report = {"simulations": results, "allPassed": all_passed}
    save_json(out_dir / "simulation-report.json", report)

    lines = ["# Angle Finder Simulation Report", ""]
    for r in results:
        status = "PASS" if r["passed"] else "FAIL"
        lines.append(f"## {r['caseId']} — {status}")
        lines.append(f"- Target: {r['targetLabel']}")
        lines.append(f"- Suitable: {r['feasibility']['suitable']} → {r['fallbackMode']}")
        lines.append(f"- Clarity: start {r['startClarity']} → peak {r['peakClarity']} (threshold {r['winThreshold']})")
        if r["validationErrors"]:
            lines.append(f"- Errors: {r['validationErrors']}")
        lines.append("")

    lines.append(f"**Overall: {'ALL PASSED' if all_passed else 'SOME FAILED'}**")
    (out_dir / "simulation-report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    for r in results:
        status = "PASS" if r["passed"] else "FAIL"
        print(f"{status}: {r['caseId']} ({r['targetLabel']})")

    print(f"\nReport: {out_dir / 'simulation-report.json'}")
    return 0 if all_passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
