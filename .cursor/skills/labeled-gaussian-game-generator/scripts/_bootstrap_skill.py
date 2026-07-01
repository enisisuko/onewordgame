#!/usr/bin/env python3
"""Bootstrap labeled-gaussian-game-generator skill assets."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def schema_defs() -> None:
    vec3 = {"type": "array", "items": {"type": "number"}, "minItems": 3, "maxItems": 3}
    bounds = {
        "type": "object",
        "properties": {"min": vec3, "max": vec3},
        "required": ["min", "max"],
    }
    write_json(ROOT / "schemas/scene-labels.schema.json", {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "scene-labels.schema.json",
        "type": "object",
        "required": ["sceneId", "objects"],
        "properties": {
            "sceneId": {"type": "string"},
            "coordinateSystem": {"type": "object"},
            "sourceCamera": {"type": "object"},
            "objects": {"type": "array", "items": {"type": "object"}},
            "surfaces": {"type": "array", "items": {"type": "object"}},
            "regions": {"type": "array", "items": {"type": "object"}},
        },
    })
    write_json(ROOT / "schemas/semantic-scene.schema.json", {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "semantic-scene.schema.json",
        "type": "object",
        "required": ["sceneId", "entities"],
        "properties": {
            "sceneId": {"type": "string"},
            "entities": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["id", "semanticType", "position"],
                    "properties": {
                        "id": {"type": "string"},
                        "semanticType": {"type": "string"},
                        "position": vec3,
                        "bounds": bounds,
                        "confidence": {"type": "number"},
                        "affordances": {"type": "array", "items": {"type": "string"}},
                        "gameRoles": {"type": "array", "items": {"type": "string"}},
                        "relations": {"type": "array"},
                    },
                },
            },
        },
    })
    write_json(ROOT / "schemas/game-spec.schema.json", {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "game-spec.schema.json",
        "type": "object",
        "required": ["title", "genre", "winCondition", "loseCondition", "mechanics"],
        "properties": {
            "title": {"type": "string"},
            "genre": {"type": "string"},
            "perspective": {"type": "string"},
            "playabilityMode": {"type": "string"},
            "durationSeconds": {"type": "number"},
            "player": {"type": "object"},
            "coreLoop": {"type": "array", "items": {"type": "string"}},
            "winCondition": {"type": "object"},
            "loseCondition": {"type": "object"},
            "mechanics": {"type": "array"},
            "acceptanceTests": {"type": "array", "items": {"type": "string"}},
        },
    })
    write_json(ROOT / "schemas/mechanic-bindings.schema.json", {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "mechanic-bindings.schema.json",
        "type": "object",
        "required": ["bindings"],
        "properties": {
            "bindings": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["mechanicId", "objectId", "semanticLabel", "gameRole"],
                    "properties": {
                        "mechanicId": {"type": "string"},
                        "objectId": {"type": "string"},
                        "semanticLabel": {"type": "string"},
                        "gameRole": {"type": "string"},
                        "confidence": {"type": "number"},
                    },
                },
            }
        },
    })
    write_json(ROOT / "schemas/game-intent.schema.json", {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "game-intent.schema.json",
        "type": "object",
        "required": ["rawRequest", "explicitIntent", "inferredIntent"],
        "properties": {
            "rawRequest": {"type": "string"},
            "explicitIntent": {"type": "object"},
            "inferredIntent": {"type": "object"},
            "assumptions": {"type": "array", "items": {"type": "string"}},
            "ambiguities": {"type": "array"},
            "hardRequirements": {"type": "array", "items": {"type": "string"}},
            "softPreferences": {"type": "array", "items": {"type": "string"}},
        },
    })
    write_json(ROOT / "schemas/genre-routing.schema.json", {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "genre-routing.schema.json",
        "type": "object",
        "required": ["primaryArchetype", "confidence", "reasons"],
        "properties": {
            "primaryArchetype": {"type": "string"},
            "secondaryArchetypes": {"type": "array", "items": {"type": "string"}, "maxItems": 2},
            "confidence": {"type": "number"},
            "reasons": {"type": "array", "items": {"type": "string"}},
        },
    })
    write_json(ROOT / "schemas/scene-capabilities.schema.json", {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "scene-capabilities.schema.json",
        "type": "object",
        "required": ["capabilities"],
        "properties": {"capabilities": {"type": "object"}},
    })
    write_json(ROOT / "schemas/mechanic-graph.schema.json", {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "mechanic-graph.schema.json",
        "type": "object",
        "required": ["nodes", "edges"],
        "properties": {
            "nodes": {"type": "array", "items": {"type": "object", "required": ["id", "type"]}},
            "edges": {"type": "array", "items": {"type": "object", "required": ["from", "to", "relation"]}},
        },
    })
    write_json(ROOT / "schemas/state-machine.schema.json", {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "state-machine.schema.json",
        "type": "object",
        "required": ["initialState", "states"],
        "properties": {
            "initialState": {"type": "string"},
            "states": {"type": "object"},
        },
    })
    for name in ("camera-plan", "control-plan", "ui-plan", "content-budget", "fallback-plan"):
        write_json(ROOT / f"schemas/{name}.schema.json", {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "$id": f"{name}.schema.json",
            "type": "object",
        })
    write_json(ROOT / "schemas/solvability-report.schema.json", {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "solvability-report.schema.json",
        "type": "object",
        "required": ["solvable"],
        "properties": {
            "solvable": {"type": "boolean"},
            "path": {"type": "array", "items": {"type": "string"}},
            "verifiedConditions": {"type": "array", "items": {"type": "string"}},
        },
    })
    write_json(ROOT / "schemas/design-review.schema.json", {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "design-review.schema.json",
        "type": "object",
        "required": ["approved"],
        "properties": {
            "approved": {"type": "boolean"},
            "coreFantasyPreserved": {"type": "boolean"},
            "sceneSupportScore": {"type": "number"},
        },
    })
    write_json(ROOT / "schemas/quality-score.schema.json", {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "quality-score.schema.json",
        "type": "object",
        "required": ["overall", "dimensions", "blockingIssues"],
        "properties": {
            "overall": {"type": "number"},
            "dimensions": {"type": "object"},
            "blockingIssues": {"type": "array"},
            "warnings": {"type": "array", "items": {"type": "string"}},
        },
    })


RECIPE_IDS = [
    "exploration", "collection", "delivery", "escape", "puzzle", "horror", "stealth",
    "wave-survival", "shooting-gallery", "tower-defense", "platform-challenge", "fishing",
    "racing-path", "management", "crafting", "sorting", "detective", "narrative",
    "hide-and-seek", "rhythm", "memory", "party-microgame", "defense", "escort", "repair",
]

RECIPE_DEFAULTS: dict[str, dict[str, list[str]]] = {
    "exploration": {
        "requiredSceneEvidence": ["at least one reachable region", "at least one valid spawn surface"],
        "optionalSceneEvidence": ["landmarks", "containers"],
        "requiredMechanics": ["movement_or_pointer_navigation", "discovery_objective", "completion_condition"],
        "recommendedCameraModes": ["limited_first_person", "fixed_view", "orbit_limited"],
        "mandatoryTests": ["player can reach discovery targets", "completion triggers once", "restart restores state"],
        "fallbackArchetypes": ["fixed_view_discovery", "screen_space_click"],
    },
    "collection": {
        "requiredSceneEvidence": ["at least one reachable region", "spawn surfaces or collectibles"],
        "optionalSceneEvidence": ["containers", "shelves", "tables"],
        "requiredMechanics": ["movement_or_pointer_navigation", "pickup_or_click", "progress_tracking", "completion_condition"],
        "recommendedCameraModes": ["limited_first_person", "fixed_view", "top_down"],
        "mandatoryTests": ["all required collectibles are reachable", "completion triggers exactly once", "restart restores every collectible"],
        "fallbackArchetypes": ["hidden_object", "screen_space_collection"],
    },
    "delivery": {
        "requiredSceneEvidence": ["pickup sources", "delivery target container or region"],
        "optionalSceneEvidence": ["tables", "counters"],
        "requiredMechanics": ["pickup", "carry_or_transport", "delivery_detection", "completion_condition"],
        "recommendedCameraModes": ["limited_first_person", "top_down"],
        "mandatoryTests": ["items can be picked up", "delivery target exists", "wrong placement does not win"],
        "fallbackArchetypes": ["proximity_delivery", "click_delivery"],
    },
    "escape": {
        "requiredSceneEvidence": ["exit or door", "player spawn"],
        "optionalSceneEvidence": ["keys", "locks", "hazards"],
        "requiredMechanics": ["movement", "objective_chain", "exit_trigger"],
        "recommendedCameraModes": ["limited_first_person", "rail_camera"],
        "mandatoryTests": ["exit exists", "unlock chain solvable", "exit triggers win"],
        "fallbackArchetypes": ["timed_escape", "screen_space_escape"],
    },
    "fishing": {
        "requiredSceneEvidence": ["water surface label", "shore or platform anchor"],
        "optionalSceneEvidence": ["boat", "pier"],
        "requiredMechanics": ["cast", "bite_event", "timing_input", "score_or_reward"],
        "recommendedCameraModes": ["fixed_view", "limited_first_person"],
        "mandatoryTests": ["cast area on water", "bite can trigger", "reward settles", "round can repeat"],
        "fallbackArchetypes": ["screen_space_fishing", "throw_target_water"],
    },
    "racing-path": {
        "requiredSceneEvidence": ["continuous path or road", "start and finish anchors"],
        "optionalSceneEvidence": ["barriers", "checkpoints"],
        "requiredMechanics": ["movement_along_path", "timer_or_score", "finish_detection"],
        "recommendedCameraModes": ["rail_camera", "third_person_limited"],
        "mandatoryTests": ["path is traversable", "finish reachable before timeout", "restart resets timer"],
        "fallbackArchetypes": ["fixed_path_race", "auto_forward_dodge"],
    },
    "detective": {
        "requiredSceneEvidence": ["at least three inspectable objects", "final inference or choice point"],
        "optionalSceneEvidence": ["terminals", "documents"],
        "requiredMechanics": ["inspect", "clue_tracking", "final_choice_or_solution"],
        "recommendedCameraModes": ["fixed_view", "limited_first_person"],
        "mandatoryTests": ["three clues reachable", "evidence chain complete", "wrong answer gives feedback"],
        "fallbackArchetypes": ["hidden_object_clues", "screen_space_puzzle"],
    },
}


def default_recipe(recipe_id: str) -> dict[str, object]:
    base = RECIPE_DEFAULTS.get(recipe_id, {
        "requiredSceneEvidence": ["at least one reachable region"],
        "optionalSceneEvidence": ["interactive objects"],
        "requiredMechanics": ["core_loop", "feedback", "completion_condition"],
        "recommendedCameraModes": ["fixed_view", "limited_first_person"],
        "mandatoryTests": ["win condition reachable", "lose or end condition works", "restart works"],
        "fallbackArchetypes": ["screen_space", "fixed_view"],
    })
    return {"id": recipe_id, **base}


def recipes() -> None:
    for rid in RECIPE_IDS:
        write_json(ROOT / f"recipes/{rid}.json", default_recipe(rid))


def templates() -> None:
    write_json(ROOT / "templates/game-spec.json", {
        "title": "Example Game",
        "genre": "collection",
        "perspective": "first_person",
        "playabilityMode": "limited_3d",
        "durationSeconds": 60,
        "player": {"spawnAnchor": "floor_01", "moveSpeed": 2.5, "interactionDistance": 2.0},
        "coreLoop": ["explore", "interact", "complete objective"],
        "winCondition": {"type": "collect", "requiredCount": 3},
        "loseCondition": {"type": "timer", "seconds": 60},
        "mechanics": [{"type": "pickup", "sourceLabels": ["collectible"]}],
        "acceptanceTests": ["player can move", "objective completable", "restart works"],
    })
    write_json(ROOT / "templates/mechanic-recipe.json", default_recipe("collection"))
    write_text(ROOT / "templates/BUILD_REPORT.md", """# Build Report

## User Request

<!-- 用户原始游戏要求 -->

## Selected Game Design

<!-- 最终选择的游戏类型和玩法 -->

## Gaussian Assets

<!-- 使用了哪些高斯、碰撞和元数据文件 -->

## Semantic Labels Used

<!-- 实际用于游戏机制的标签 -->

## Mechanic Bindings

<!-- 每个机制绑定到了哪个场景物体 -->

## Rejected Labels

<!-- 低置信度、尺度异常或空间冲突而未采用的标签 -->

## Generated Objects

<!-- 场景原有物体 vs 游戏动态生成物体 -->

## Fallbacks

<!-- 碰撞降级、移动降级、标签替代、玩法替代、屏幕空间交互降级 -->

## Tests

<!-- 实际完成的测试及结果 -->

## Known Limitations

<!-- 单张图片、遮挡区域和不可见空间带来的限制 -->
""")


def main() -> None:
    schema_defs()
    recipes()
    templates()
    print(f"Bootstrap complete: {ROOT}")


if __name__ == "__main__":
    main()
