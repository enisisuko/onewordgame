#!/usr/bin/env python3
"""Build mechanic dependency graph."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _skill_utils import load_json, build_mechanic_graph, save_json


def main() -> int:
    parser = argparse.ArgumentParser(description="Build mechanic graph")
    parser.add_argument("routing", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    routing = load_json(args.routing)
    graph = build_mechanic_graph(routing["primaryArchetype"])
    save_json(args.output, graph)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
