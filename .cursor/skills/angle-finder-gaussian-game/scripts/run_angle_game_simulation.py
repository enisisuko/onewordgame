#!/usr/bin/env python3
"""End-to-end simulation with 3 mock angle-finder game cases."""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _skill_utils import (
    MOCK_METADATA,
    SIMULATION_CASES,
    assess_feasibility,
    build_game_spec,
    load_json,
    print_report,
    save_json,
    validate_schema_minimal,
)
from build_clarity_curve import build_curve

SCHEMAS_DIR = Path(__file__).resolve().parent.parent / "schemas"


def simulate_case(case_id: str, request: str, mock_key: str, answer: str, expected_mode: str) -> list[str]:
    errors: list[str] = []
    metadata = dict(MOCK_METADATA[mock_key])

    curve = build_curve(metadata)
    feasibility = assess_feasibility(curve, metadata)

    if feasibility["recommendedMode"] != expected_mode:
        errors.append(
            f"expected mode {expected_mode}, got {feasibility['recommendedMode']} "
            f"(symmetryRisk={feasibility['symmetryRisk']})"
        )

    peak = max(curve["samples"], key=lambda s: s["clarity"])
    if peak["clarity"] < 0.95:
        errors.append(f"peak clarity too low: {peak['clarity']}")

    off_peak = [s for s in curve["samples"] if abs(s["azimuthDeg"] - curve["peakAzimuthDeg"]) >= 90]
    if off_peak and sum(s["clarity"] for s in off_peak) / len(off_peak) > 0.45:
        if expected_mode == "angle_orbit":
            errors.append("off-peak clarity too high for angle_orbit case")

    spec = build_game_spec(case_id, answer, feasibility["recommendedMode"], metadata, f"{case_id}-curve.json")
    spec_errors = validate_schema_minimal(spec, SCHEMAS_DIR / "angle-game-spec.schema.json")
    errors.extend(spec_errors)

    if spec["guessMode"] == "multi_choice" and answer not in spec.get("choices", []):
        errors.append("correct answer missing from choices")

    intent = {
        "rawRequest": request,
        "correctAnswer": answer,
        "difficulty": "normal",
        "sessionLengthSeconds": 90,
        "targetPlatform": "mobile_web",
    }

    ui_plan = {
        "clarityMeter": {"type": "horizontal_bar", "position": "top"},
        "compass": {"enabled": expected_mode == "angle_orbit"},
        "guessPanel": {"mode": spec["guessMode"], "position": "bottom"},
        "timer": {"position": "top_right", "seconds": 90},
    }

    return errors, {
        "caseId": case_id,
        "feasibility": feasibility,
        "peakClarity": peak["clarity"],
        "recommendedMode": feasibility["recommendedMode"],
        "guessMode": spec["guessMode"],
        "intent": intent,
        "uiPlan": ui_plan,
    }


def main() -> int:
    out_dir = Path(__file__).resolve().parent.parent / "test-results"
    out_dir.mkdir(parents=True, exist_ok=True)

    report_cases = []
    all_errors: list[str] = []

    for case_id, request, mock_key, answer, expected_mode in SIMULATION_CASES:
        errors, case_report = simulate_case(case_id, request, mock_key, answer, expected_mode)
        report_cases.append(case_report)
        if errors:
            all_errors.extend([f"{case_id}: {e}" for e in errors])
        else:
            print(f"PASS: simulation {case_id} ({case_report['recommendedMode']})")

    report = {
        "simulation": "angle-finder-gaussian-game",
        "cases": report_cases,
        "passed": len(all_errors) == 0,
        "errorCount": len(all_errors),
    }
    save_json(out_dir / "simulation-report.json", report)

    lines = ["# Angle Finder Simulation Report\n"]
    for c in report_cases:
        lines.append(f"## {c['caseId']}\n")
        lines.append(f"- Mode: {c['recommendedMode']} (guess: {c['guessMode']})\n")
        lines.append(f"- Peak clarity: {c['peakClarity']}\n")
        lines.append(f"- Feasibility: {json.dumps(c['feasibility'], ensure_ascii=False)}\n")
    (out_dir / "simulation-report.md").write_text("".join(lines), encoding="utf-8")

    return print_report("run_angle_game_simulation (3 cases)", all_errors)


if __name__ == "__main__":
    raise SystemExit(main())
