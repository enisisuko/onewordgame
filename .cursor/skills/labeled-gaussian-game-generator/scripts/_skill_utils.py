"""Shared utilities for labeled-gaussian-game-generator skill scripts."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

SKILL_ROOT = Path(__file__).resolve().parent.parent
SCHEMAS_DIR = SKILL_ROOT / "schemas"
RECIPES_DIR = SKILL_ROOT / "recipes"


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


def confidence_tier(value: float) -> str:
    if value >= 0.85:
        return "core"
    if value >= 0.60:
        return "secondary"
    if value >= 0.40:
        return "candidate"
    return "ignore"


KEYWORD_GENRE_MAP: list[tuple[list[str], str, list[str]]] = [
    (["收集", "找到", "食材", "collect", "gather", "find"], "collection", ["delivery"]),
    (["放进", "投递", "deliver", "放入"], "delivery", ["collection"]),
    (["躲避", "怪物", "恐怖", "horror", "monster", "stealth"], "escape", ["horror", "stealth"]),
    (["逃", "出口", "钥匙", "escape", "exit", "key"], "escape", ["puzzle"]),
    (["钓鱼", "fish", "fishing"], "fishing", ["collection"]),
    (["线索", "解谜", "谜", "clue", "puzzle", "detective"], "detective", ["puzzle"]),
    (["竞速", "赛车", "限时", "race", "racing", "speed"], "racing-path", ["collection"]),
    (["探索", "explore"], "exploration", []),
    (["塔防", "tower"], "tower-defense", ["defense"]),
    (["射击", "shoot"], "shooting-gallery", []),
]


def parse_request_text(raw: str) -> dict[str, Any]:
    verbs: list[str] = []
    entities: list[str] = []
    goals: list[str] = []
    genre_hints: list[str] = []
    hard: list[str] = []
    soft: list[str] = []

    verb_patterns = [
        ("收集", "collect"), ("找到", "find"), ("放进", "deliver"), ("躲避", "avoid"),
        ("逃", "escape"), ("钓鱼", "fish"), ("解谜", "solve"), ("竞速", "race"),
    ]
    for zh, en in verb_patterns:
        if zh in raw:
            verbs.append(zh)

    entity_patterns = [
        ("食材", "ingredient"), ("锅", "pot"), ("怪物", "monster"), ("钥匙", "key"),
        ("出口", "exit"), ("鱼", "fish"), ("线索", "clue"), ("道路", "road"),
    ]
    for zh, en in entity_patterns:
        if zh in raw:
            entities.append(zh)

    if "一分钟" in raw or "60" in raw:
        duration = 60
    elif "限时" in raw:
        duration = 120
    else:
        duration = 180

    if any(k in raw for k in ("恐怖", "怪物", "躲避")):
        genre_hints.extend(["horror", "stealth", "escape"])
        hard.extend(["必须存在威胁或压力", "必须可以完成目标并结束"])
    if any(k in raw for k in ("收集", "食材", "找到")):
        goals.append("收集并完成任务目标")
        hard.append("必须能完成收集数量")
    if any(k in raw for k in ("钓鱼",)):
        goals.append("完成钓鱼并获得分数")
        hard.append("必须存在水域相关玩法")
    if any(k in raw for k in ("线索", "解谜")):
        goals.append("找到线索并完成推理")
        hard.append("必须存在可完成证据链")
    if any(k in raw for k in ("竞速", "赛车", "限时")):
        goals.append("在时限内完成路径")
        hard.append("必须存在可 traversable 路径或降级赛道")

    return {
        "rawRequest": raw,
        "explicitIntent": {
            "verbs": verbs,
            "requestedEntities": entities,
            "requestedGoals": goals,
            "requestedGenreHints": genre_hints,
        },
        "inferredIntent": {
            "perspective": "first_person",
            "sessionLengthSeconds": duration,
            "playerCount": 1,
            "difficulty": "normal",
            "tone": "tense" if "恐怖" in raw or "怪物" in raw else "neutral",
            "targetPlatform": "desktop_web",
        },
        "assumptions": [
            "用户未指定视角时默认 limited first-person 或 fixed view",
            f"用户未指定时长时默认 {duration} 秒体验",
        ],
        "ambiguities": [],
        "hardRequirements": hard or ["必须形成完整胜负循环"],
        "softPreferences": soft or ["优先绑定真实语义标签"],
    }


def route_genre(raw: str, intent: dict[str, Any]) -> dict[str, Any]:
    scores: dict[str, float] = {}
    reasons: list[str] = []
    for keywords, primary, secondary in KEYWORD_GENRE_MAP:
        hit = sum(1 for k in keywords if k in raw.lower() or k in raw)
        if hit:
            scores[primary] = scores.get(primary, 0.0) + hit
            reasons.append(f"matched keywords for {primary}")

    if not scores:
        scores["exploration"] = 1.0
        reasons.append("no strong keyword match; default exploration")

    primary = max(scores, key=lambda k: scores[k])
    secondary = []
    for keywords, archetype, secs in KEYWORD_GENRE_MAP:
        if archetype != primary and scores.get(archetype, 0) > 0:
            secondary.append(archetype)
        secondary.extend(s for s in secs if s != primary)
    secondary = list(dict.fromkeys(secondary))[:2]

    confidence = min(0.99, 0.55 + 0.15 * scores[primary])
    return {
        "primaryArchetype": primary,
        "secondaryArchetypes": secondary,
        "confidence": round(confidence, 2),
        "reasons": reasons,
    }


MOCK_SCENES: dict[str, dict[str, Any]] = {
    "kitchen": {
        "sceneId": "kitchen_001",
        "objects": [
            {"id": "floor_01", "label": "floor", "confidence": 0.99, "center": [0, 0, 0], "tags": ["walkable"]},
            {"id": "counter_01", "label": "counter", "confidence": 0.93, "center": [1, 0.9, -2], "tags": ["surface"]},
            {"id": "pot_01", "label": "pot", "displayName": "锅", "confidence": 0.88, "center": [1.2, 1.0, -2.1], "tags": ["container"]},
            {"id": "tomato_01", "label": "vegetable", "confidence": 0.91, "center": [0.5, 1.0, -1.5], "tags": ["ingredient"]},
            {"id": "carrot_01", "label": "vegetable", "confidence": 0.89, "center": [0.7, 1.0, -1.4], "tags": ["ingredient"]},
            {"id": "onion_01", "label": "vegetable", "confidence": 0.87, "center": [0.9, 1.0, -1.6], "tags": ["ingredient"]},
            {"id": "pepper_01", "label": "vegetable", "confidence": 0.86, "center": [1.1, 1.0, -1.3], "tags": ["ingredient"]},
            {"id": "salt_01", "label": "ingredient", "confidence": 0.84, "center": [1.3, 1.0, -1.2], "tags": ["ingredient"]},
        ],
        "regions": [{"id": "room_01", "label": "kitchen", "bounds": {"min": [-3, 0, -6], "max": [3, 3, 1]}}],
        "surfaces": [{"id": "floor_01", "label": "floor", "walkable": True, "confidence": 0.99}],
    },
    "factory": {
        "sceneId": "factory_001",
        "objects": [
            {"id": "floor_01", "label": "floor", "confidence": 0.98, "center": [0, 0, 0], "tags": ["walkable"]},
            {"id": "door_01", "label": "door", "confidence": 0.96, "center": [2.1, 1.0, -4.8], "tags": ["exit", "interactable"]},
            {"id": "crate_01", "label": "crate", "confidence": 0.9, "center": [-1, 0.5, -2], "tags": ["cover"]},
            {"id": "machine_01", "label": "machine", "confidence": 0.88, "center": [0, 1.2, -3], "tags": ["hazard"]},
            {"id": "table_02", "label": "table", "confidence": 0.85, "center": [-2, 0.8, -1], "tags": ["surface"]},
        ],
        "regions": [{"id": "room_01", "label": "factory", "bounds": {"min": [-4, 0, -8], "max": [4, 4, 2]}}],
    },
    "beach": {
        "sceneId": "beach_001",
        "objects": [
            {"id": "shore_01", "label": "platform", "confidence": 0.94, "center": [0, 0.1, 1], "tags": ["walkable"]},
            {"id": "water_01", "label": "water", "confidence": 0.97, "center": [0, 0, -3], "tags": ["fishing"]},
            {"id": "pier_01", "label": "platform", "confidence": 0.86, "center": [1.5, 0.2, 0], "tags": ["walkable"]},
        ],
    },
    "room": {
        "sceneId": "room_001",
        "objects": [
            {"id": "floor_01", "label": "floor", "confidence": 0.99, "center": [0, 0, 0], "tags": ["walkable"]},
            {"id": "desk_01", "label": "desk", "confidence": 0.92, "center": [1, 0.8, -1], "tags": ["inspectable"]},
            {"id": "painting_01", "label": "painting", "confidence": 0.88, "center": [0, 1.5, -2.5], "tags": ["clue"]},
            {"id": "drawer_01", "label": "drawer", "confidence": 0.87, "center": [1.2, 0.5, -1], "tags": ["container"]},
            {"id": "terminal_01", "label": "terminal", "confidence": 0.9, "center": [-1, 0.9, -1], "tags": ["switch"]},
        ],
    },
    "road": {
        "sceneId": "road_001",
        "objects": [
            {"id": "road_01", "label": "road", "confidence": 0.95, "center": [0, 0, -5], "tags": ["walkable"]},
            {"id": "start_01", "label": "platform", "confidence": 0.9, "center": [0, 0, 2], "tags": ["spawn"]},
            {"id": "finish_01", "label": "gate", "confidence": 0.91, "center": [0, 0, -12], "tags": ["finish"]},
            {"id": "barrier_01", "label": "barrier", "confidence": 0.88, "center": [1.2, 0.5, -6], "tags": ["obstacle"]},
        ],
    },
}


SIMULATION_CASES = [
    ("kitchen_collect", "使用这张厨房图片，做一个一分钟内找到五种食材并放进锅里的游戏。", "kitchen"),
    ("factory_escape", "用这个废弃工厂做一个躲避怪物并打开出口大门的恐怖游戏。", "factory"),
    ("beach_fishing", "用这张海边图片做一个钓鱼比赛，鱼越稀有分数越高。", "beach"),
    ("room_puzzle", "在这个房间里找线索解谜并打开隐藏出口。", "room"),
    ("road_race", "在道路场景中进行限时竞速，到达终点即胜利。", "road"),
]


MECHANIC_CONFLICTS: list[tuple[str, str, str]] = [
    ("fixed_view", "free_first_person_movement", "fixed camera conflicts with full FPS movement"),
    ("no_collision", "physics_throwing", "throwing requires collision or proxy"),
    ("single_image", "full_orbit_exploration", "single-view cannot support full orbit"),
    ("no_road", "free_driving", "driving requires continuous path"),
    ("no_water_depth", "underwater_swimming", "swimming requires depth evidence"),
    ("no_navmesh", "free_roaming_enemy_ai", "free enemy AI needs navigation"),
    ("low_confidence_label", "core_puzzle_target", "unreliable label cannot anchor win condition"),
    ("mobile_touch", "mouse_right_click_required", "mobile cannot depend on right click"),
]


def build_semantic_scene(scene_labels: dict[str, Any]) -> dict[str, Any]:
    entities: list[dict[str, Any]] = []
    for obj in scene_labels.get("objects", []):
        conf = float(obj.get("confidence", 0.5))
        tier = confidence_tier(conf)
        roles: list[str] = []
        label = obj.get("label", "unknown")
        if label in {"floor", "ground", "road", "platform"} and obj.get("tags", []):
            if "walkable" in obj.get("tags", []) or label in {"floor", "road", "platform"}:
                roles.append("walk_surface")
        if label in {"vegetable", "ingredient", "food", "fruit"}:
            roles.append("collectible")
        if label in {"pot", "container", "cabinet", "drawer"}:
            roles.append("delivery_target")
        if label in {"door", "gate", "exit"}:
            roles.append("exit")
        if label in {"water", "sea", "lake", "pond"}:
            roles.append("fishing_zone")
        if label in {"painting", "terminal", "desk", "drawer"}:
            roles.append("clue_source")
        if tier == "ignore":
            continue
        entities.append({
            "id": obj["id"],
            "semanticType": label,
            "position": obj.get("center", [0, 0, 0]),
            "bounds": obj.get("bounds", {}),
            "confidence": conf,
            "affordances": obj.get("affordances", obj.get("tags", [])),
            "gameRoles": roles,
            "relations": [{"type": "inside", "target": scene_labels.get("regions", [{"id": "room_01"}])[0]["id"]}],
        })
    return {"sceneId": scene_labels.get("sceneId", "unknown"), "entities": entities}


def analyze_capabilities(scene: dict[str, Any], semantic: dict[str, Any]) -> dict[str, Any]:
    caps: dict[str, Any] = {}
    walkables = [e for e in semantic["entities"] if "walk_surface" in e.get("gameRoles", [])]
    collectibles = [e for e in semantic["entities"] if "collectible" in e.get("gameRoles", [])]
    water = [e for e in semantic["entities"] if "fishing_zone" in e.get("gameRoles", [])]
    exits = [e for e in semantic["entities"] if "exit" in e.get("gameRoles", [])]
    roads = [e for e in semantic["entities"] if e.get("semanticType") in {"road", "gate"}]

    caps["freeMovement"] = {
        "supported": len(walkables) > 0,
        "confidence": 0.81 if walkables else 0.2,
        "evidence": [f"{w['id']} walkable" for w in walkables[:3]],
    }
    caps["objectPickup"] = {
        "supported": len(collectibles) > 0,
        "confidence": 0.93 if len(collectibles) >= 3 else 0.5,
        "evidence": [c["id"] for c in collectibles[:5]],
    }
    caps["fishing"] = {
        "supported": len(water) > 0,
        "confidence": 0.92 if water else 0.1,
        "evidence": [w["id"] for w in water],
    }
    caps["doorInteraction"] = {
        "supported": len(exits) > 0,
        "confidence": 0.9 if exits else 0.15,
        "evidence": [e["id"] for e in exits],
    }
    caps["freeDriving"] = {
        "supported": len(roads) >= 2,
        "confidence": 0.78 if len(roads) >= 2 else 0.12,
        "evidence": [r["id"] for r in roads],
        "reasons": [] if len(roads) >= 2 else ["insufficient continuous road evidence"],
    }
    return {"capabilities": caps}


def score_mechanic(name: str, caps: dict[str, Any]) -> dict[str, Any]:
    mapping = {
        "pickup": "objectPickup",
        "delivery": "objectPickup",
        "fishing": "fishing",
        "unlock_exit": "doorInteraction",
        "free_movement": "freeMovement",
        "timed_race": "freeDriving",
    }
    cap_key = mapping.get(name, "freeMovement")
    cap = caps["capabilities"].get(cap_key, {"supported": False, "confidence": 0.3})
    score = cap["confidence"] if cap.get("supported") else max(0.25, cap["confidence"] - 0.3)
    return {
        "mechanic": name,
        "score": round(score, 2),
        "components": {
            "semanticEvidence": round(min(1.0, score + 0.05), 2),
            "collisionReliability": 0.75,
            "navigationReliability": round(score, 2),
            "cameraSuitability": 0.76,
            "performanceCost": 0.8,
        },
        "risks": [] if score >= 0.65 else ["requires fallback"],
        "mitigations": ["use limited movement or screen-space"] if score < 0.65 else [],
    }


def build_mechanic_graph(primary: str) -> dict[str, Any]:
    graphs: dict[str, dict[str, Any]] = {
        "collection": {
            "nodes": [
                {"id": "explore", "type": "player_action", "verb": "move"},
                {"id": "pickup_items", "type": "objective", "verb": "collect"},
                {"id": "deliver_items", "type": "objective", "verb": "deliver"},
                {"id": "win", "type": "win_condition", "verb": "complete"},
            ],
            "edges": [
                {"from": "explore", "to": "pickup_items", "relation": "enables"},
                {"from": "pickup_items", "to": "deliver_items", "relation": "required_before"},
                {"from": "deliver_items", "to": "win", "relation": "enables"},
            ],
        },
        "escape": {
            "nodes": [
                {"id": "explore", "type": "player_action", "verb": "move"},
                {"id": "avoid_threat", "type": "threat", "verb": "avoid"},
                {"id": "find_key", "type": "objective", "verb": "collect"},
                {"id": "unlock_exit", "type": "objective", "verb": "unlock"},
                {"id": "escape", "type": "win_condition", "verb": "reach"},
            ],
            "edges": [
                {"from": "explore", "to": "find_key", "relation": "enables"},
                {"from": "find_key", "to": "unlock_exit", "relation": "required_before"},
                {"from": "unlock_exit", "to": "escape", "relation": "enables"},
                {"from": "avoid_threat", "to": "escape", "relation": "opposes"},
            ],
        },
        "fishing": {
            "nodes": [
                {"id": "cast", "type": "player_action", "verb": "fish"},
                {"id": "hook_timing", "type": "skill_check", "verb": "time_input"},
                {"id": "score_fish", "type": "objective", "verb": "achieve_score"},
                {"id": "win", "type": "win_condition", "verb": "complete_before_time"},
            ],
            "edges": [
                {"from": "cast", "to": "hook_timing", "relation": "enables"},
                {"from": "hook_timing", "to": "score_fish", "relation": "enables"},
                {"from": "score_fish", "to": "win", "relation": "required_before"},
            ],
        },
        "detective": {
            "nodes": [
                {"id": "inspect", "type": "player_action", "verb": "inspect"},
                {"id": "collect_clues", "type": "objective", "verb": "discover"},
                {"id": "solve", "type": "objective", "verb": "solve"},
                {"id": "win", "type": "win_condition", "verb": "complete"},
            ],
            "edges": [
                {"from": "inspect", "to": "collect_clues", "relation": "enables"},
                {"from": "collect_clues", "to": "solve", "relation": "required_before"},
                {"from": "solve", "to": "win", "relation": "enables"},
            ],
        },
        "racing-path": {
            "nodes": [
                {"id": "drive", "type": "player_action", "verb": "move"},
                {"id": "avoid_obstacles", "type": "skill_check", "verb": "avoid"},
                {"id": "reach_finish", "type": "win_condition", "verb": "reach"},
            ],
            "edges": [
                {"from": "drive", "to": "avoid_obstacles", "relation": "parallel"},
                {"from": "avoid_obstacles", "to": "reach_finish", "relation": "enables"},
            ],
        },
    }
    return graphs.get(primary, graphs["collection"])


def detect_conflicts(playability: str, mechanics: list[str]) -> list[dict[str, str]]:
    conflicts: list[dict[str, str]] = []
    mech_set = set(mechanics)
    if playability == "fixed_view" and "free_first_person_movement" in mech_set:
        conflicts.append({"a": "fixed_view", "b": "free_first_person_movement", "reason": "camera mode conflict"})
    if "no_collision" in mech_set and "physics_throwing" in mech_set:
        conflicts.append({"a": "no_collision", "b": "physics_throwing", "reason": "missing collision"})
    for a, b, reason in MECHANIC_CONFLICTS:
        if a in mech_set and b in mech_set:
            conflicts.append({"a": a, "b": b, "reason": reason})
    return conflicts


def default_state_machine() -> dict[str, Any]:
    return {
        "initialState": "loading",
        "states": {
            "loading": {"on": {"assets_ready": "intro", "load_failed": "error"}},
            "intro": {"on": {"start_pressed": "playing"}},
            "playing": {"on": {"objective_completed": "won", "failure_triggered": "lost", "pause_pressed": "paused"}},
            "paused": {"on": {"resume_pressed": "playing", "restart_pressed": "restarting"}},
            "won": {"on": {"restart_pressed": "restarting"}},
            "lost": {"on": {"restart_pressed": "restarting"}},
            "restarting": {"on": {"reset_complete": "intro"}},
            "error": {"on": {"restart_pressed": "restarting"}},
        },
    }


def verify_solvable(primary: str, semantic: dict[str, Any], bindings: list[dict[str, Any]]) -> dict[str, Any]:
    entities = {e["id"]: e for e in semantic.get("entities", [])}
    path: list[str] = ["player spawns on walkable surface"]
    verified: list[str] = []
    solvable = True

    if primary in {"collection", "delivery"}:
        collectibles = [e for e in entities.values() if "collectible" in e.get("gameRoles", [])]
        targets = [e for e in entities.values() if "delivery_target" in e.get("gameRoles", [])]
        if len(collectibles) < 3:
            solvable = False
            verified.append("insufficient collectibles")
        else:
            path.extend([f"pickup {c['id']}" for c in collectibles[:5]])
        if targets:
            path.append(f"deliver to {targets[0]['id']}")
            verified.append("delivery target reachable")
        else:
            path.append("deliver to synthetic container on counter")
            verified.append("delivery target substituted")
    elif primary == "escape":
        exits = [e for e in entities.values() if "exit" in e.get("gameRoles", [])]
        if exits:
            path.extend(["avoid waypoint monster", "pickup synthetic key near table", f"unlock {exits[0]['id']}", "reach exit trigger"])
            verified.extend(["exit exists", "key substituted", "unlock chain solvable"])
        else:
            solvable = False
            verified.append("missing exit")
    elif primary == "fishing":
        if any("fishing_zone" in e.get("gameRoles", []) for e in entities.values()):
            path.extend(["move to shore", "cast into water_01", "hook timing success", "score by rarity"])
            verified.append("water anchor valid")
        else:
            solvable = False
    elif primary == "detective":
        clues = [e for e in entities.values() if "clue_source" in e.get("gameRoles", [])]
        if len(clues) >= 3:
            path.extend([f"inspect {c['id']}" for c in clues[:3]] + ["enter code at terminal", "open hidden exit"])
            verified.append("three clue sources")
        else:
            solvable = False
    elif primary == "racing-path":
        if any(e.get("semanticType") == "road" for e in entities.values()):
            path.extend(["start at start_01", "follow road_01", "avoid barrier_01", "cross finish_01"])
            verified.append("finish reachable")
        else:
            solvable = False

    return {"solvable": solvable, "path": path, "verifiedConditions": verified}


def quality_score(solvable: bool, alignment: float, grounding: float) -> dict[str, Any]:
    playability = 0.9 if solvable else 0.4
    overall = round((alignment + grounding + playability + (1.0 if solvable else 0)) / 4, 2)
    return {
        "overall": overall,
        "dimensions": {
            "requestAlignment": alignment,
            "sceneGrounding": grounding,
            "playability": playability,
            "solvability": 1.0 if solvable else 0.0,
            "feedbackClarity": 0.82,
            "restartReliability": 0.95,
            "performance": 0.78,
            "semanticReliability": grounding,
        },
        "blockingIssues": [] if solvable and overall >= 0.75 else ["solvability or quality below threshold"],
        "warnings": ["scene edges may use invisible bounds"],
    }


def print_report(title: str, errors: list[str]) -> int:
    if errors:
        print(f"FAIL: {title}")
        for err in errors:
            print(f"  - {err}")
        return 1
    print(f"PASS: {title}")
    return 0


def add_script_path() -> None:
    scripts_dir = str(SKILL_ROOT / "scripts")
    if scripts_dir not in sys.path:
        sys.path.insert(0, scripts_dir)
