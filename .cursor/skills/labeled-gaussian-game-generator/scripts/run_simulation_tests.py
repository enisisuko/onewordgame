#!/usr/bin/env python3
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
    lines = ["# Simulation Test Report\n"]
    for r in results:
        lines.append(f"## {r['caseId']}\n")
        lines.append(f"- Primary genre: {r['genreRouting']['primaryArchetype']}\n")
        lines.append(f"- Mechanics: {', '.join(r['selectedMechanics'])}\n")
        lines.append(f"- Solvable: {r['solvability']['solvable']}\n")
        lines.append(f"- Quality: {r['qualityScore']['overall']}\n")
        lines.append(f"- Fallbacks: {', '.join(r['fallbacks']) or 'none'}\n\n")
    (out_dir / "simulation-report.md").write_text("".join(lines), encoding="utf-8")
    print(json.dumps({"allPassed": report["allPassed"], "cases": len(results)}, indent=2))
    return 0 if report["allPassed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
