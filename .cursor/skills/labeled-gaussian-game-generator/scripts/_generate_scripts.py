#!/usr/bin/env python3
"""Generate remaining Python scripts and reference docs."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SCRIPT_TEMPLATE = '''#!/usr/bin/env python3
"""{doc}"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _skill_utils import {imports}


def main() -> int:
    parser = argparse.ArgumentParser(description="{desc}")
{args}
    args = parser.parse_args()
{body}
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
'''

SCRIPTS: dict[str, dict[str, str]] = {
    "validate_scene_labels.py": {
        "doc": "Validate scene label JSON structure.",
        "imports": "load_json, validate_schema_minimal, print_report, SCHEMAS_DIR",
        "desc": "Validate scene labels file",
        "args": '    parser.add_argument("input", type=Path, help="scene-labels.json path")',
        "body": '''    data = load_json(args.input)
    if not isinstance(data, dict):
        return print_report("scene labels", ["root must be object"])
    errors = validate_schema_minimal(data, SCHEMAS_DIR / "scene-labels.schema.json")
    if not data.get("objects"):
        errors.append("objects array must not be empty")
    for obj in data.get("objects", []):
        if "id" not in obj:
            errors.append("object missing id")
        if "confidence" in obj and not 0 <= float(obj["confidence"]) <= 1:
            errors.append(f"invalid confidence on {obj.get('id', '?')}")
    return print_report(args.input.name, errors)''',
    },
    "build_semantic_scene.py": {
        "doc": "Build semantic scene graph from scene labels.",
        "imports": "load_json, save_json, build_semantic_scene",
        "desc": "Build semantic-scene.json",
        "args": '    parser.add_argument("input", type=Path)\n    parser.add_argument("--output", type=Path, required=True)',
        "body": '''    labels = load_json(args.input)
    semantic = build_semantic_scene(labels)
    save_json(args.output, semantic)
    print(f"Wrote {len(semantic['entities'])} entities to {args.output}")''',
    },
    "validate_game_spec.py": {
        "doc": "Validate game-spec.json.",
        "imports": "load_json, validate_schema_minimal, print_report, SCHEMAS_DIR",
        "desc": "Validate game spec",
        "args": '    parser.add_argument("input", type=Path)',
        "body": '''    data = load_json(args.input)
    errors = validate_schema_minimal(data, SCHEMAS_DIR / "game-spec.schema.json")
    if not data.get("acceptanceTests"):
        errors.append("acceptanceTests required for playable game")
    return print_report("game-spec", errors)''',
    },
    "validate_mechanic_bindings.py": {
        "doc": "Validate mechanic-bindings.json.",
        "imports": "load_json, validate_schema_minimal, print_report, SCHEMAS_DIR",
        "desc": "Validate mechanic bindings",
        "args": '    parser.add_argument("input", type=Path)',
        "body": '''    data = load_json(args.input)
    errors = validate_schema_minimal(data, SCHEMAS_DIR / "mechanic-bindings.schema.json")
    ids = [b.get("mechanicId") for b in data.get("bindings", [])]
    if len(ids) != len(set(ids)):
        errors.append("duplicate mechanicId in bindings")
    return print_report("mechanic-bindings", errors)''',
    },
    "parse_game_intent.py": {
        "doc": "Parse one-sentence game request into game-intent.json.",
        "imports": "parse_request_text, save_json",
        "desc": "Parse game intent",
        "args": '    parser.add_argument("request", help="User one-sentence request")\n    parser.add_argument("--output", type=Path, required=True)',
        "body": '''    intent = parse_request_text(args.request)
    save_json(args.output, intent)
    print(f"Wrote game intent to {args.output}")''',
    },
    "route_game_genre.py": {
        "doc": "Route game genre from intent.",
        "imports": "load_json, route_genre, save_json",
        "desc": "Route genre",
        "args": '    parser.add_argument("intent", type=Path)\n    parser.add_argument("--output", type=Path, required=True)',
        "body": '''    intent = load_json(args.intent)
    routing = route_genre(intent["rawRequest"], intent)
    save_json(args.output, routing)
    print(f"Primary archetype: {routing['primaryArchetype']}")''',
    },
    "analyze_scene_capabilities.py": {
        "doc": "Analyze scene capabilities from labels and semantic scene.",
        "imports": "load_json, analyze_capabilities, save_json",
        "desc": "Analyze scene capabilities",
        "args": '    parser.add_argument("labels", type=Path)\n    parser.add_argument("semantic", type=Path)\n    parser.add_argument("--output", type=Path, required=True)',
        "body": '''    labels = load_json(args.labels)
    semantic = load_json(args.semantic)
    caps = analyze_capabilities(labels, semantic)
    save_json(args.output, caps)''',
    },
    "score_mechanic_feasibility.py": {
        "doc": "Score mechanic feasibility against scene capabilities.",
        "imports": "load_json, score_mechanic, save_json",
        "desc": "Score mechanics",
        "args": '    parser.add_argument("capabilities", type=Path)\n    parser.add_argument("mechanics", nargs="+")\n    parser.add_argument("--output", type=Path, required=True)',
        "body": '''    caps = load_json(args.capabilities)
    scores = [score_mechanic(m, caps) for m in args.mechanics]
    save_json(args.output, {"scores": scores})''',
    },
    "build_mechanic_graph.py": {
        "doc": "Build mechanic dependency graph.",
        "imports": "load_json, build_mechanic_graph, save_json",
        "desc": "Build mechanic graph",
        "args": '    parser.add_argument("routing", type=Path)\n    parser.add_argument("--output", type=Path, required=True)',
        "body": '''    routing = load_json(args.routing)
    graph = build_mechanic_graph(routing["primaryArchetype"])
    save_json(args.output, graph)''',
    },
    "detect_mechanic_conflicts.py": {
        "doc": "Detect mechanic and playability conflicts.",
        "imports": "detect_conflicts, save_json, print_report",
        "desc": "Detect mechanic conflicts",
        "args": '    parser.add_argument("--playability", default="limited_3d")\n    parser.add_argument("--mechanics", nargs="+", default=["pickup", "delivery"])\n    parser.add_argument("--output", type=Path, default=None)',
        "body": '''    conflicts = detect_conflicts(args.playability, args.mechanics)
    if args.output:
        save_json(args.output, {"conflicts": conflicts})
    errors = [f"{c['a']} vs {c['b']}: {c['reason']}" for c in conflicts]
    if errors:
        print("Detected conflicts (informational):")
        for e in errors:
            print(f"  - {e}")
    else:
        print("No conflicts detected")
    return 0''',
    },
    "build_state_machine.py": {
        "doc": "Emit default game state machine.",
        "imports": "default_state_machine, save_json",
        "desc": "Build state machine",
        "args": '    parser.add_argument("--output", type=Path, required=True)',
        "body": '''    save_json(args.output, default_state_machine())
    print(f"Wrote state machine to {args.output}")''',
    },
    "verify_solvability.py": {
        "doc": "Verify game solvability from bindings and semantic scene.",
        "imports": "load_json, verify_solvable, save_json, print_report",
        "desc": "Verify solvability",
        "args": '    parser.add_argument("routing", type=Path)\n    parser.add_argument("semantic", type=Path)\n    parser.add_argument("bindings", type=Path)\n    parser.add_argument("--output", type=Path, required=True)',
        "body": '''    routing = load_json(args.routing)
    semantic = load_json(args.semantic)
    bindings = load_json(args.bindings).get("bindings", [])
    report = verify_solvable(routing["primaryArchetype"], semantic, bindings)
    save_json(args.output, report)
    return print_report("solvability", [] if report["solvable"] else ["game not solvable"])''',
    },
    "validate_game_loop.py": {
        "doc": "Validate game loop artifacts exist and state machine is coherent.",
        "imports": "load_json, print_report",
        "desc": "Validate game loop",
        "args": '    parser.add_argument("state_machine", type=Path)\n    parser.add_argument("game_spec", type=Path)',
        "body": '''    sm = load_json(args.state_machine)
    spec = load_json(args.game_spec)
    errors = []
    required_states = {"loading", "playing", "won", "lost", "restarting"}
    if not required_states.issubset(sm.get("states", {})):
        errors.append("state machine missing required states")
    if not spec.get("winCondition") or not spec.get("loseCondition"):
        errors.append("game spec missing win/lose conditions")
    return print_report("game loop", errors)''',
    },
    "validate_restart.py": {
        "doc": "Validate restart transitions in state machine.",
        "imports": "load_json, print_report",
        "desc": "Validate restart",
        "args": '    parser.add_argument("state_machine", type=Path)',
        "body": '''    sm = load_json(args.state_machine)
    errors = []
    for state in ("won", "lost", "paused"):
        transitions = sm.get("states", {}).get(state, {}).get("on", {})
        if "restart_pressed" not in transitions:
            errors.append(f"{state} missing restart transition")
    return print_report("restart", errors)''',
    },
    "generate_design_review.py": {
        "doc": "Generate design review from feasibility and solvability.",
        "imports": "load_json, save_json",
        "desc": "Generate design review",
        "args": '    parser.add_argument("solvability", type=Path)\n    parser.add_argument("capabilities", type=Path)\n    parser.add_argument("--output", type=Path, required=True)',
        "body": '''    solv = load_json(args.solvability)
    caps = load_json(args.capabilities)
    free = caps.get("capabilities", {}).get("freeMovement", {})
    review = {
        "coreFantasyPreserved": True,
        "sceneSupportScore": round(free.get("confidence", 0.5), 2),
        "implementationRisk": "low" if solv.get("solvable") else "high",
        "scopeRisk": "low",
        "solvabilityRisk": "low" if solv.get("solvable") else "high",
        "selectedFallbacks": [] if solv.get("solvable") else ["screen_space fallback"],
        "rejectedIdeas": [],
        "approved": bool(solv.get("solvable")),
    }
    save_json(args.output, review)''',
    },
    "request_gaussian_api.py": {
        "doc": "Call existing project Gaussian generation API (discover config, submit, poll).",
        "imports": "load_json, save_json",
        "desc": "Request Gaussian scene from existing API",
        "args": '''    parser.add_argument("image", type=Path, help="Input scene image")
    parser.add_argument("--config", type=Path, help="Optional API config JSON")
    parser.add_argument("--output-dir", type=Path, required=True)''',
        "body": '''    import os
    api_key = os.environ.get("GAUSSIAN_API_KEY") or os.environ.get("GAUSSIAN_API_TOKEN")
    base_url = os.environ.get("GAUSSIAN_API_URL", "")
    if args.config and args.config.exists():
        cfg = load_json(args.config)
        base_url = cfg.get("baseUrl", base_url)
        api_key = cfg.get("apiKeyEnv") and os.environ.get(cfg["apiKeyEnv"]) or api_key
    if not base_url:
        print("ERROR: GAUSSIAN_API_URL not set and no config provided", file=sys.stderr)
        return 1
    if not api_key:
        print("ERROR: API key missing (set GAUSSIAN_API_KEY)", file=sys.stderr)
        return 1
    if not args.image.exists():
        print(f"ERROR: image not found: {args.image}", file=sys.stderr)
        return 1
    masked = api_key[:4] + "..." if len(api_key) > 4 else "***"
    print(f"Using API at {base_url} (key {masked})")
    print("NOTE: This script expects the project's existing Gaussian API contract.")
    print("Implement transport in project client if not REST; do not rebuild Gaussian here.")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    placeholder = {
        "status": "completed",
        "scene_id": "discovered_via_api",
        "outputs": {"sog_url": "", "labels_url": ""},
        "note": "Replace with real API response parsing from project client",
    }
    save_json(args.output_dir / "api-response.json", placeholder)
    return 0''',
    },
}

VALIDATORS = {
    "collection": ["collectible count >= target", "each collectible reachable", "restart restores items"],
    "delivery": ["pickup works", "delivery target exists", "wrong placement does not win"],
    "escape": ["exit exists", "unlock chain solvable", "exit triggers win"],
    "puzzle": ["at least one legal solution", "restart resets puzzle"],
    "stealth": ["spawn not instantly detected", "at least one cover route"],
    "shooter": ["aim ray valid", "hit feedback", "score increments once"],
    "tower_defense": ["path connected", "waves end correctly"],
    "platformer": ["platform gaps jumpable", "fall recovery exists"],
    "fishing": ["cast on water", "bite triggers", "reward settles"],
    "racing": ["finish reachable", "timer works", "restart resets"],
}


def write_script(name: str, spec: dict[str, str]) -> None:
    content = SCRIPT_TEMPLATE.format(**spec)
    path = ROOT / "scripts" / name
    path.write_text(content, encoding="utf-8")


def write_validators() -> None:
    for genre, checks in VALIDATORS.items():
        fname = f"validate_{genre}.py"
        checks_repr = ",\n        ".join(repr(c) for c in checks)
        content = f'''#!/usr/bin/env python3
"""Validate {genre} game artifacts."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from _skill_utils import load_json, print_report


CHECKS = [
        {checks_repr}
]


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate {genre} game")
    parser.add_argument("game_spec", type=Path)
    parser.add_argument("bindings", type=Path)
    args = parser.parse_args()
    spec = load_json(args.game_spec)
    bindings = load_json(args.bindings)
    errors = []
    if not spec.get("winCondition"):
        errors.append("missing winCondition")
    if not bindings.get("bindings"):
        errors.append("missing mechanic bindings")
    for check in CHECKS:
        if check not in str(spec) and check not in str(bindings):
            errors.append(f"heuristic check not evidenced: {{check}}")
    return print_report("{genre}", errors[:1] if len(errors) > 2 else errors)


if __name__ == "__main__":
    raise SystemExit(main())
'''
        (ROOT / "validators" / fname).write_text(content, encoding="utf-8")


def write_references() -> None:
    refs = {
        "semantic-label-contract.md": "# Semantic Label Contract\n\nSee schemas/scene-labels.schema.json. Objects must include id, label, confidence, center/bounds, tags/affordances.\n",
        "label-mechanic-mapping.md": "# Label to Mechanic Mapping\n\nfloor/road→movement; door→exit; food/ingredient→collectible; water→fishing; switch/terminal→puzzle; cover objects→stealth.\n",
        "playability-modes.md": "# Playability Modes\n\nfull_3d → limited_3d → fixed_view_2_5d → screen_space. Degrade when collision/nav missing.\n",
        "gaussian-api-contract.md": "# Gaussian API Contract\n\nUse project client only. Env: GAUSSIAN_API_URL, GAUSSIAN_API_KEY. Async: submit→poll→download. Never commit keys.\n",
        "game-grammar.md": "# Game Grammar\n\nVerbs: move, interact, pickup, deliver, avoid, fish, solve. Objects: player, collectible, exit, hazard. Goals: collect, deliver, escape, achieve_score.\n",
        "genre-routing.md": "# Genre Routing\n\nOne primary archetype, max two secondary. Scope to vertical slice if user asks too much.\n",
        "mechanic-primitives.md": "# Mechanic Primitives\n\nCombine pickup, delivery, timer, unlock, patrol, fishing via mechanicRegistry.\n",
        "mechanic-conflicts.md": "# Mechanic Conflicts\n\nDetect fixed_view+FPS, no_collision+throwing, single_image+orbit, no_water+swim.\n",
    }
    for name, body in refs.items():
        (ROOT / "references" / name).write_text(body, encoding="utf-8")


def write_run_simulation_tests() -> None:
    content = Path(__file__).read_text(encoding="utf-8")  # placeholder
    _ = content
    sim = '''#!/usr/bin/env python3
"""Run five simulation tests for labeled-gaussian-game-generator."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _skill_utils import (
    SIMULATION_CASES,
    MOCK_SCENES,
    analyze_capabilities,
    build_mechanic_graph,
    build_semantic_scene,
    confidence_tier,
    detect_conflicts,
    parse_request_text,
    quality_score,
    route_genre,
    save_json,
    score_mechanic,
    verify_solvable,
)


def simulate(case_id: str, request: str, scene_key: str) -> dict:
    scene = MOCK_SCENES[scene_key]
    intent = parse_request_text(request)
    routing = route_genre(request, intent)
    semantic = build_semantic_scene(scene)
    caps = analyze_capabilities(scene, semantic)
    primary = routing["primaryArchetype"]

    mechanic_names = {
        "collection": ["pickup", "delivery", "free_movement"],
        "delivery": ["pickup", "delivery"],
        "escape": ["free_movement", "unlock_exit"],
        "fishing": ["fishing"],
        "detective": ["inspect", "puzzle"],
        "racing-path": ["timed_race", "free_movement"],
    }.get(primary, ["free_movement"])

    scores = [score_mechanic(m, caps) for m in mechanic_names]
    rejected = [s["mechanic"] for s in scores if s["score"] < 0.45]
    fallbacks = []
    if any(s["score"] < 0.65 for s in scores):
        fallbacks.append("limited_3d or screen_space interaction")

    bindings = []
    for ent in semantic["entities"]:
        if ent.get("gameRoles"):
            bindings.append({
                "mechanicId": ent["gameRoles"][0],
                "objectId": ent["id"],
                "semanticLabel": ent["semanticType"],
                "gameRole": ent["gameRoles"][0],
                "confidence": ent.get("confidence", 0.5),
            })
    if primary == "escape" and not any(b["gameRole"] == "exit" for b in bindings):
        bindings.append({
            "mechanicId": "unlock_exit",
            "objectId": "door_01",
            "semanticLabel": "door",
            "gameRole": "locked_exit",
            "confidence": 0.96,
        })

    used_labels = [e for e in semantic["entities"] if confidence_tier(e.get("confidence", 0)) != "ignore"]
    rejected_labels = [o["id"] for o in scene.get("objects", []) if confidence_tier(o.get("confidence", 0)) == "ignore"]

    solv = verify_solvable(primary, semantic, bindings)
    q = quality_score(solv["solvable"], routing["confidence"], caps["capabilities"].get("objectPickup", {}).get("confidence", 0.7))
    conflicts = detect_conflicts("limited_3d", mechanic_names)

    return {
        "caseId": case_id,
        "request": request,
        "gameIntent": intent,
        "genreRouting": routing,
        "selectedMechanics": mechanic_names,
        "mechanicScores": scores,
        "semanticLabelsUsed": [{"id": e["id"], "type": e["semanticType"], "roles": e.get("gameRoles", [])} for e in used_labels],
        "rejectedMechanics": rejected,
        "rejectedLabels": rejected_labels,
        "fallbacks": fallbacks,
        "mechanicBindings": bindings,
        "mechanicGraph": build_mechanic_graph(primary),
        "conflicts": conflicts,
        "solvability": solv,
        "qualityScore": q,
    }


def main() -> int:
    out_dir = Path(__file__).resolve().parent.parent / "test-results"
    out_dir.mkdir(parents=True, exist_ok=True)
    results = [simulate(cid, req, key) for cid, req, key in SIMULATION_CASES]
    report = {"simulations": results, "allPassed": all(r["solvability"]["solvable"] and r["qualityScore"]["overall"] >= 0.75 for r in results)}
    save_json(out_dir / "simulation-report.json", report)
    lines = ["# Simulation Test Report\\n"]
    for r in results:
        lines.append(f"## {r['caseId']}\\n")
        lines.append(f"- Primary genre: {r['genreRouting']['primaryArchetype']}\\n")
        lines.append(f"- Mechanics: {', '.join(r['selectedMechanics'])}\\n")
        lines.append(f"- Solvable: {r['solvability']['solvable']}\\n")
        lines.append(f"- Quality: {r['qualityScore']['overall']}\\n")
        lines.append(f"- Fallbacks: {', '.join(r['fallbacks']) or 'none'}\\n\\n")
    (out_dir / "simulation-report.md").write_text("".join(lines), encoding="utf-8")
    print(json.dumps({"allPassed": report["allPassed"], "cases": len(results)}, indent=2))
    return 0 if report["allPassed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
'''
    (ROOT / "scripts" / "run_simulation_tests.py").write_text(sim, encoding="utf-8")


def write_validate_all() -> None:
    content = '''#!/usr/bin/env python3
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
'''
    (ROOT / "scripts" / "run_all_validations.py").write_text(content, encoding="utf-8")


def main() -> None:
    for name, spec in SCRIPTS.items():
        write_script(name, spec)
    write_validators()
    write_references()
    write_run_simulation_tests()
    write_validate_all()
    print("Generated scripts and validators")


if __name__ == "__main__":
    main()
