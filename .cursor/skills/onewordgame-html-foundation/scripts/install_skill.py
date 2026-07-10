#!/usr/bin/env python3
"""Copy this portable skill into an explicitly supplied AI Skills root."""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path


SKILL_NAME = "onewordgame-html-foundation"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("skills_root", type=Path, help="Destination Skills root supported by the target AI")
    parser.add_argument("--force", action="store_true", help="Overlay an existing installed copy")
    args = parser.parse_args()

    source = Path(__file__).resolve().parents[1]
    root = args.skills_root.expanduser().resolve()
    destination = root / SKILL_NAME
    if destination == source or source in destination.parents:
        print("error: destination must be outside the source skill", file=sys.stderr)
        return 2
    if destination.exists() and any(destination.iterdir()) and not args.force:
        print(f"error: installed skill exists; use --force to overlay: {destination}", file=sys.stderr)
        return 2

    root.mkdir(parents=True, exist_ok=True)
    shutil.copytree(
        source,
        destination,
        dirs_exist_ok=args.force,
        ignore=shutil.ignore_patterns("__pycache__", "*.pyc"),
    )
    print(destination)
    return 0


if __name__ == "__main__":
    sys.exit(main())
