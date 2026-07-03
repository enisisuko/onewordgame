"""Shared utilities for angle-finder-gaussian-game skill scripts."""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path
from typing import Any

SKILL_ROOT = Path(__file__).resolve().parent.parent
SCHEMAS_DIR = SKILL_ROOT / "schemas"
RECIPES_DIR = SKILL_ROOT / "recipes"

SIGMA_BY_DIFFICULTY = {
    "easy": 0.35,
    "normal": 0.22,
    "hard": 0.12,
}


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise SystemExit(f"ERROR: file not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise SystemExit(f"ERROR: invalid JSON in {path}: {exc}") from exc


def save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def validate_required(data: dict[str, Any], keys: list[str], label: str) -> list[str]:
    errors: list[str] = []
    for key in keys:
        if key not in data:
            errors.append(f"{label}: missing required field '{key}'")
    return errors


def validate_schema_minimal(data: dict[str, Any], schema_path: Path) -> list[str]:
    """Minimal structural validation without third-party jsonschema."""
    schema = load_json(schema_path)
    errors: list[str] = []
    for key in schema.get("required", []):
        if key not in data:
            errors.append(f"schema {schema_path.name}: missing '{key}'")
    return errors


def vec_sub(a: list[float], b: list[float]) -> list[float]:
    return [a[i] - b[i] for i in range(3)]


def vec_len(v: list[float]) -> float:
    return math.sqrt(sum(x * x for x in v))


def vec_normalize(v: list[float]) -> list[float]:
    length = vec_len(v)
    if length < 1e-9:
        return [0.0, 0.0, 1.0]
    return [x / length for x in v]


def spherical_to_dir(yaw_deg: float, pitch_deg: float) -> list[float]:
    """Yaw around Y, pitch up from horizontal (degrees)."""
    yaw = math.radians(yaw_deg)
    pitch = math.radians(pitch_deg)
    cp = math.cos(pitch)
    return [cp * math.sin(yaw), math.sin(pitch), cp * math.cos(yaw)]


def angular_distance_deg(dir_a: list[float], dir_b: list[float]) -> float:
    dot = sum(a * b for a, b in zip(dir_a, dir_b))
    dot = max(-1.0, min(1.0, dot))
    return math.degrees(math.acos(dot))


def clarity_from_angle_deg(theta_deg: float, sigma_rad: float) -> float:
    theta_rad = math.radians(theta_deg)
    clarity = math.exp(-0.5 * (theta_rad / sigma_rad) ** 2)
    return max(0.05, min(1.0, clarity))


def bounds_center(bounds: dict[str, Any]) -> list[float]:
    mn = bounds["min"]
    mx = bounds["max"]
    return [(mn[i] + mx[i]) / 2 for i in range(3)]


def infer_canonical_angles(metadata: dict[str, Any]) -> tuple[float, float, str]:
    if "canonicalYawDegrees" in metadata and "canonicalPitchDegrees" in metadata:
        return (
            float(metadata["canonicalYawDegrees"]),
            float(metadata["canonicalPitchDegrees"]),
            "api_metadata",
        )
    cam = metadata.get("sourceCamera", {})
    centroid = metadata.get("centroid", bounds_center(metadata["bounds"]))
    pos = cam.get("position")
    if pos:
        direction = vec_normalize(vec_sub(pos, centroid))
        yaw = math.degrees(math.atan2(direction[0], direction[2]))
        pitch = math.degrees(math.asin(max(-1.0, min(1.0, direction[1]))))
        return yaw, pitch, "api_metadata"
    return 0.0, 15.0, "inferred_default"


def build_clarity_samples(
    peak_yaw: float,
    peak_pitch: float,
    sigma_rad: float,
    yaw_step: int = 15,
    pitch_step: int = 15,
) -> list[dict[str, Any]]:
    peak_dir = spherical_to_dir(peak_yaw, peak_pitch)
    samples: list[dict[str, Any]] = []
    for yaw in range(-180, 181, yaw_step):
        for pitch in range(-60, 76, pitch_step):
            d = spherical_to_dir(float(yaw), float(pitch))
            theta = angular_distance_deg(d, peak_dir)
            c = clarity_from_angle_deg(theta, sigma_rad)
            samples.append({
                "yawDegrees": float(yaw),
                "pitchDegrees": float(pitch),
                "clarity": round(c, 4),
            })
    return samples


def evaluate_feasibility(
    metadata: dict[str, Any],
    samples: list[dict[str, Any]],
) -> dict[str, Any]:
    clarities = [s["clarity"] for s in samples]
    peak_clarity = max(clarities)
    mean_clarity = sum(clarities) / len(clarities)
    peak_sharpness = peak_clarity / max(mean_clarity, 0.01)

    peak_yaw, peak_pitch, _ = infer_canonical_angles(metadata)
    peak_sample = max(samples, key=lambda s: s["clarity"])
    at_peak = [s for s in samples if abs(s["yawDegrees"] - peak_sample["yawDegrees"]) < 8
               and abs(s["pitchDegrees"] - peak_sample["pitchDegrees"]) < 8]
    off_peak = [s for s in samples if angular_distance_deg(
        spherical_to_dir(s["yawDegrees"], s["pitchDegrees"]),
        spherical_to_dir(peak_sample["yawDegrees"], peak_sample["pitchDegrees"]),
    ) > 60]
    peak_mean = sum(s["clarity"] for s in at_peak) / max(len(at_peak), 1)
    off_mean = sum(s["clarity"] for s in off_peak) / max(len(off_peak), 1)
    asymmetry_ratio = (peak_mean - off_mean) / max(peak_mean, 0.01)
    symmetry_score = round(min(1.0, max(0.0, asymmetry_ratio)), 3)

    view_dep = float(metadata.get("viewDependenceScore", 0.7))
    suitable = peak_sharpness > 1.8 and view_dep > 0.5 and symmetry_score > 0.35

    return {
        "suitable": suitable,
        "peakSharpness": round(peak_sharpness, 3),
        "symmetryScore": round(symmetry_score, 3),
        "viewDependenceScore": view_dep,
        "recommendedMode": "angle_orbit" if suitable else "gradual_reveal",
        "reasons": [] if suitable else [
            "low peak sharpness or symmetry suggests poor angle puzzle",
        ],
    }


MOCK_METADATA: dict[str, dict[str, Any]] = {
    "coffee_mug": {
        "sceneId": "mock_coffee_mug",
        "qualityTier": "fast_rough",
        "sourceCamera": {"position": [0.3, 1.1, 2.8], "target": [0, 0.5, 0], "fovDegrees": 48},
        "centroid": [0.02, 0.48, 0.0],
        "bounds": {"min": [-0.25, 0.0, -0.2], "max": [0.28, 0.95, 0.22]},
        "canonicalYawDegrees": 5,
        "canonicalPitchDegrees": 18,
        "reconstructionConfidence": 0.58,
        "viewDependenceScore": 0.91,
        "targetLabel": "咖啡杯",
    },
    "sports_car": {
        "sceneId": "mock_sports_car",
        "qualityTier": "fast_rough",
        "sourceCamera": {"position": [-1.5, 0.9, 3.2], "target": [0, 0.4, 0], "fovDegrees": 55},
        "centroid": [0.0, 0.35, 0.0],
        "bounds": {"min": [-1.1, 0.0, -0.5], "max": [1.1, 0.7, 0.5]},
        "canonicalYawDegrees": -25,
        "canonicalPitchDegrees": 12,
        "reconstructionConfidence": 0.61,
        "viewDependenceScore": 0.86,
        "targetLabel": "红色跑车",
    },
    "sphere_symmetric": {
        "sceneId": "mock_sphere",
        "qualityTier": "fast_rough",
        "sourceCamera": {"position": [0, 1.0, 2.5], "target": [0, 0.5, 0], "fovDegrees": 50},
        "centroid": [0.0, 0.5, 0.0],
        "bounds": {"min": [-0.35, 0.15, -0.35], "max": [0.35, 0.85, 0.35]},
        "canonicalYawDegrees": 0,
        "canonicalPitchDegrees": 15,
        "reconstructionConfidence": 0.55,
        "viewDependenceScore": 0.32,
        "targetLabel": "皮球",
    },
}

SIMULATION_CASES = [
    ("coffee_angle_puzzle", "coffee_mug", "normal"),
    ("car_angle_puzzle", "sports_car", "hard"),
    ("sphere_fallback", "sphere_symmetric", "normal"),
]


def build_game_spec_from_recipe(
    metadata: dict[str, Any],
    feasibility: dict[str, Any],
    difficulty: str = "normal",
) -> dict[str, Any]:
    recipe = load_json(RECIPES_DIR / "angle-identification.json")
    spec = dict(recipe["gameSpecTemplate"])
    spec["targetLabel"] = metadata.get("targetLabel", "unknown")
    spec["difficulty"] = difficulty
    overrides = recipe.get("difficultyOverrides", {}).get(difficulty, {})
    if "clarityConfig" in overrides:
        spec["clarityConfig"] = {**spec["clarityConfig"], **overrides["clarityConfig"]}
    if "loseCondition" in overrides:
        spec["loseCondition"] = {**spec["loseCondition"], **overrides["loseCondition"]}
    if not feasibility.get("suitable", True):
        patch = recipe["fallbackGradualReveal"]["gameSpecPatch"]
        spec.update(patch)
        spec["fallbackMode"] = "gradual_reveal"
    distractors_map = {
        "咖啡杯": ["茶壶", "花瓶", "马克杯"],
        "红色跑车": ["卡车", "自行车", "公交车"],
        "皮球": ["篮球", "足球", "气球"],
    }
    label = spec["targetLabel"]
    spec["distractors"] = distractors_map.get(label, ["物体A", "物体B", "物体C"])
    return spec


def print_report(title: str, errors: list[str]) -> int:
    if errors:
        print(f"FAIL: {title}")
        for err in errors:
            print(f"  - {err}")
        return 1
    print(f"PASS: {title}")
    return 0
