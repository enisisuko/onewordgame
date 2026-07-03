#!/usr/bin/env python3
"""Validate and normalize a source image for the fast Gaussian upload pipeline."""
from __future__ import annotations

import argparse
import hashlib
import shutil
import struct
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _skill_utils import save_json

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MIME_BY_EXT = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}
WARN_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


def detect_mime(path: Path) -> str:
    ext = path.suffix.lower()
    if ext not in MIME_BY_EXT:
        raise ValueError(f"unsupported image extension '{ext}' (use jpg/png/webp)")
    return MIME_BY_EXT[ext]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _read_png_dimensions(data: bytes) -> tuple[int, int] | None:
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    length = struct.unpack(">I", data[8:12])[0]
    if length != 13 or data[12:16] != b"IHDR":
        return None
    width, height = struct.unpack(">II", data[16:24])
    return int(width), int(height)


def _read_jpeg_dimensions(data: bytes) -> tuple[int, int] | None:
    if len(data) < 4 or data[0:2] != b"\xff\xd8":
        return None
    index = 2
    while index + 4 < len(data):
        if data[index] != 0xFF:
            index += 1
            continue
        marker = data[index + 1]
        index += 2
        if marker in (0xD8, 0xD9):
            continue
        if index + 2 > len(data):
            break
        segment_length = struct.unpack(">H", data[index : index + 2])[0]
        if segment_length < 2:
            break
        if marker in (
            0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
            0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF,
        ):
            if index + 7 <= len(data):
                height, width = struct.unpack(">HH", data[index + 3 : index + 7])
                return int(width), int(height)
            return None
        index += segment_length
    return None


def _read_webp_dimensions(data: bytes) -> tuple[int, int] | None:
    if len(data) < 30 or data[0:4] != b"RIFF" or data[8:12] != b"WEBP":
        return None
    chunk = data[12:16]
    if chunk == b"VP8 " and len(data) >= 30:
        width = struct.unpack("<H", data[26:28])[0] & 0x3FFF
        height = struct.unpack("<H", data[28:30])[0] & 0x3FFF
        return int(width), int(height)
    if chunk == b"VP8L" and len(data) >= 25:
        bits = struct.unpack("<I", data[21:25])[0]
        width = (bits & 0x3FFF) + 1
        height = ((bits >> 14) & 0x3FFF) + 1
        return int(width), int(height)
    if chunk == b"VP8X" and len(data) >= 30:
        width = 1 + struct.unpack("<I", data[24:27] + b"\x00")[0]
        height = 1 + struct.unpack("<I", data[27:30] + b"\x00")[0]
        return int(width), int(height)
    return None


def detect_dimensions(path: Path, mime: str) -> tuple[int | None, int | None]:
    header = path.read_bytes()[:512]
    width: int | None
    height: int | None
    if mime == "image/png":
        dims = _read_png_dimensions(header)
    elif mime == "image/jpeg":
        dims = _read_jpeg_dimensions(header)
    elif mime == "image/webp":
        dims = _read_webp_dimensions(header)
    else:
        dims = None
    if dims:
        return dims
    return None, None


def prepare_image(source: Path, output_dir: Path) -> dict[str, Any]:
    if not source.is_file():
        raise FileNotFoundError(f"image not found: {source}")

    mime = detect_mime(source)
    size_bytes = source.stat().st_size
    if size_bytes > WARN_SIZE_BYTES:
        print(
            f"WARNING: image is {size_bytes / (1024 * 1024):.1f} MB (>10 MB); "
            "API may reject or slow down",
            file=sys.stderr,
        )

    ext = source.suffix.lower()
    if ext == ".jpeg":
        ext = ".jpg"
    input_dir = output_dir / "input"
    input_dir.mkdir(parents=True, exist_ok=True)
    dest_name = f"source-image{ext}"
    dest_path = input_dir / dest_name
    shutil.copy2(source, dest_path)

    width, height = detect_dimensions(dest_path, mime)
    manifest: dict[str, Any] = {
        "localPath": str(dest_path.as_posix()),
        "mimeType": mime,
        "sizeBytes": size_bytes,
        "sha256": sha256_file(dest_path),
    }
    if width is not None and height is not None:
        manifest["width"] = width
        manifest["height"] = height
    else:
        manifest["width"] = None
        manifest["height"] = None
        print("WARNING: could not detect image dimensions from header", file=sys.stderr)

    save_json(input_dir / "upload-manifest.json", manifest)
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare source image for fast Gaussian API upload")
    parser.add_argument("image", type=Path, help="Local image path (jpg/png/webp)")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("output-angle-game"),
        help="Skill output root (default: output-angle-game)",
    )
    args = parser.parse_args()

    try:
        manifest = prepare_image(args.image, args.output_dir)
    except FileNotFoundError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print(f"Prepared {manifest['localPath']} ({manifest['mimeType']}, {manifest['sizeBytes']} bytes)")
    if manifest.get("width") and manifest.get("height"):
        print(f"Dimensions: {manifest['width']}x{manifest['height']}")
    print(f"SHA256: {manifest['sha256']}")
    print(f"Manifest: {args.output_dir / 'input' / 'upload-manifest.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
