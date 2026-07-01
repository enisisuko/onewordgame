#!/usr/bin/env python3
"""Parse one-sentence game request into game-intent.json."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _skill_utils import parse_request_text, save_json


def main() -> int:
    parser = argparse.ArgumentParser(description="Parse game intent")
    parser.add_argument("request", help="User one-sentence request")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    intent = parse_request_text(args.request)
    save_json(args.output, intent)
    print(f"Wrote game intent to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
