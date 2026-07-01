#!/usr/bin/env python3
"""Run all skill validation checks."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def check_json_schemas() -> bool:
    errors = []
    for path in (ROOT / "schemas").glob("*.json"):
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            errors.append(f"{path.name}: {exc}")
    if errors:
        print("Schema validation FAILED")
        for e in errors:
            print(" ", e)
        return False
    print(f"Schema validation PASS ({len(list((ROOT / 'schemas').glob('*.json')))} files)")
    return True


def check_python_syntax() -> bool:
    scripts = list((ROOT / "scripts").glob("*.py")) + list((ROOT / "validators").glob("*.py"))
    failed = []
    for script in scripts:
        rc = subprocess.call([sys.executable, "-m", "py_compile", str(script)])
        if rc != 0:
            failed.append(script.name)
    if failed:
        print("Python syntax FAILED:", failed)
        return False
    print(f"Python syntax PASS ({len(scripts)} files)")
    return True


def check_recipes() -> bool:
    required = ["id", "requiredSceneEvidence", "requiredMechanics", "mandatoryTests", "fallbackArchetypes"]
    errors = []
    for path in sorted((ROOT / "recipes").glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        for key in required:
            if key not in data:
                errors.append(f"{path.name}: missing {key}")
    if errors:
        print("Recipe completeness FAILED")
        for e in errors:
            print(" ", e)
        return False
    print(f"Recipe completeness PASS ({len(list((ROOT / 'recipes').glob('*.json')))} recipes)")
    return True


def main() -> int:
    ok = all([
        check_json_schemas(),
        check_python_syntax(),
        check_recipes(),
        subprocess.call([sys.executable, str(ROOT / "scripts" / "detect_mechanic_conflicts.py")]) == 0,
        subprocess.call([sys.executable, str(ROOT / "scripts" / "run_simulation_tests.py")]) == 0,
    ])
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
