#!/usr/bin/env python3
"""Call company fast Gaussian generation API (discover config, submit, poll)."""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _skill_utils import MOCK_METADATA, load_json, save_json

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MIME_BY_EXT = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}

DEFAULT_CONFIG: dict[str, Any] = {
    "submitEndpoint": "/gaussian/fast",
    "pollEndpoint": "/tasks/{task_id}",
    "uploadMode": "multipart",
    "imageFieldName": "image",
    "timeoutSeconds": 300,
    "pollIntervalSeconds": 2,
    "apiKeyEnv": "FAST_GAUSSIAN_API_KEY",
    "authHeader": "Bearer",
    "syncResponse": False,
}


def mask_api_key(key: str) -> str:
    if not key:
        return "(none)"
    return key[:4] + "..." if len(key) > 4 else "***"


def detect_mime(path: Path) -> str:
    ext = path.suffix.lower()
    if ext not in MIME_BY_EXT:
        raise ValueError(f"unsupported image extension '{ext}' (use jpg/png/webp)")
    return MIME_BY_EXT[ext]


def validate_image(path: Path) -> str:
    if not path.is_file():
        raise FileNotFoundError(f"image not found: {path}")
    return detect_mime(path)


def resolve_config_path(cli_config: Path | None) -> Path | None:
    if cli_config:
        return cli_config
    env_path = os.environ.get("FAST_GAUSSIAN_API_CONFIG") or os.environ.get("GAUSSIAN_API_CONFIG")
    if env_path:
        candidate = Path(env_path)
        if candidate.exists():
            return candidate
    for name in ("gaussian-api.config.json", ".gaussian-api.config.json"):
        candidate = Path(name)
        if candidate.exists():
            return candidate
    return None


def load_api_config(config_path: Path | None) -> dict[str, Any]:
    cfg = dict(DEFAULT_CONFIG)
    if config_path and config_path.exists():
        file_cfg = load_json(config_path)
        if not isinstance(file_cfg, dict):
            raise SystemExit(f"ERROR: config must be a JSON object: {config_path}")
        cfg.update(file_cfg)

    base_url = (
        cfg.get("baseUrl")
        or os.environ.get("FAST_GAUSSIAN_API_URL")
        or os.environ.get("GAUSSIAN_API_URL")
        or ""
    ).rstrip("/")

    api_key_env = cfg.get("apiKeyEnv", "FAST_GAUSSIAN_API_KEY")
    api_key = (
        os.environ.get(api_key_env)
        or os.environ.get("FAST_GAUSSIAN_API_KEY")
        or os.environ.get("GAUSSIAN_API_KEY")
        or os.environ.get("GAUSSIAN_API_TOKEN")
        or ""
    )

    cfg["baseUrl"] = base_url
    cfg["apiKey"] = api_key
    cfg["apiKeyEnv"] = api_key_env
    return cfg


def is_configured(cfg: dict[str, Any]) -> bool:
    return bool(cfg.get("baseUrl") and cfg.get("apiKey"))


def copy_source_image(image_path: Path, output_dir: Path) -> Path:
    input_dir = output_dir.parent / "input"
    if output_dir.name == "assets":
        input_dir = output_dir.parent / "input"
    else:
        input_dir = output_dir / "input"
    input_dir.mkdir(parents=True, exist_ok=True)
    ext = image_path.suffix.lower()
    if ext == ".jpeg":
        ext = ".jpg"
    dest = input_dir / f"source-image{ext}"
    if image_path.resolve() != dest.resolve():
        shutil.copy2(image_path, dest)
    return dest


def write_placeholder_outputs(
    output_dir: Path,
    image_path: Path,
    *,
    reason: str,
    dry_run: bool = False,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    copied = copy_source_image(image_path, output_dir)

    placeholder_meta: dict[str, Any] = {
        "sceneId": "dry_run_placeholder" if dry_run else "offline_placeholder",
        "qualityTier": "fast_rough",
        "sogUrl": "",
        "centroid": [0.0, 0.5, 0.0],
        "bounds": {"min": [-1.0, 0.0, -1.0], "max": [1.0, 2.0, 1.0]},
        "sourceCamera": {
            "position": [0.0, 1.0, 3.0],
            "target": [0.0, 0.5, 0.0],
            "fovDegrees": 60.0,
            "azimuthDeg": 0.0,
            "elevationDeg": 15.0,
        },
        "viewDependenceScore": 0.8,
        "pipeline": "fast",
        "note": reason,
    }

    api_response = {
        "status": "completed",
        "scene_id": placeholder_meta["sceneId"],
        "outputs": {
            "sog_url": "",
            "metadata_url": "",
            "ply_url": "",
            "thumbnail_url": "",
        },
        "dry_run": dry_run,
        "placeholder": True,
        "source_image": str(copied.as_posix()),
        "note": reason,
    }

    asset_manifest = {
        "sog_url": "",
        "metadata_url": "",
        "ply_url": "",
        "thumbnail_url": "",
        "scene_id": placeholder_meta["sceneId"],
        "placeholder": True,
    }

    save_json(output_dir / "gaussian-metadata.json", placeholder_meta)
    save_json(output_dir / "api-response.json", api_response)
    save_json(output_dir / "asset-urls.json", asset_manifest)


def write_mock_outputs(output_dir: Path, mock_key: str) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    meta = dict(MOCK_METADATA[mock_key])
    save_json(output_dir / "gaussian-metadata.json", meta)
    save_json(output_dir / "api-response.json", {
        "status": "completed",
        "scene_id": meta["sceneId"],
        "outputs": {"sog_url": meta.get("sogUrl", ""), "metadata_url": ""},
        "mock": True,
        "mockKey": mock_key,
    })
    save_json(output_dir / "asset-urls.json", {
        "sog_url": meta.get("sogUrl", ""),
        "scene_id": meta["sceneId"],
        "mock": True,
    })


def build_multipart_body(
    fields: dict[str, str],
    files: dict[str, tuple[str, bytes, str]],
) -> tuple[bytes, str]:
    boundary = f"----fast-gaussian-{uuid.uuid4().hex}"
    body = bytearray()
    for name, value in fields.items():
        body.extend(f"--{boundary}\r\n".encode())
        body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        body.extend(value.encode("utf-8"))
        body.extend(b"\r\n")
    for name, (filename, content, mime) in files.items():
        body.extend(f"--{boundary}\r\n".encode())
        body.extend(
            f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode()
        )
        body.extend(f"Content-Type: {mime}\r\n\r\n".encode())
        body.extend(content)
        body.extend(b"\r\n")
    body.extend(f"--{boundary}--\r\n".encode())
    return bytes(body), boundary


def http_request(
    method: str,
    url: str,
    *,
    api_key: str,
    auth_header: str = "Bearer",
    headers: dict[str, str] | None = None,
    data: bytes | None = None,
    timeout: float = 120.0,
) -> dict[str, Any]:
    req_headers = {"Authorization": f"{auth_header} {api_key}"}
    if headers:
        req_headers.update(headers)
    request = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} for {method} {url}: {body[:500]}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"network error for {method} {url}: {exc.reason}") from exc

    if not raw.strip():
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"invalid JSON response from {url}: {raw[:200]}") from exc
    if not isinstance(parsed, dict):
        raise RuntimeError(f"expected JSON object from {url}, got {type(parsed).__name__}")
    return parsed


def download_json(url: str, *, api_key: str, auth_header: str) -> dict[str, Any]:
    return http_request("GET", url, api_key=api_key, auth_header=auth_header, timeout=60.0)


def get_nested(data: dict[str, Any], *keys: str) -> Any:
    current: Any = data
    for key in keys:
        if not isinstance(current, dict):
            return None
        if key in current:
            current = current[key]
            continue
        snake = "".join(
            ["_" + c.lower() if c.isupper() else c for c in key]
        ).lstrip("_")
        if snake in current:
            current = current[snake]
            continue
        return None
    return current


def extract_outputs(response: dict[str, Any]) -> dict[str, str]:
    outputs = response.get("outputs")
    if not isinstance(outputs, dict):
        outputs = response

    def pick(*names: str) -> str:
        for name in names:
            value = outputs.get(name)
            if isinstance(value, str) and value:
                return value
        return ""

    return {
        "sog_url": pick("sog_url", "sogUrl", "sog"),
        "metadata_url": pick("metadata_url", "metadataUrl", "metadata"),
        "ply_url": pick("ply_url", "plyUrl", "ply"),
        "thumbnail_url": pick("thumbnail_url", "thumbnailUrl", "thumbnail"),
        "scene_id": str(
            response.get("scene_id")
            or response.get("sceneId")
            or outputs.get("scene_id")
            or outputs.get("sceneId")
            or ""
        ),
    }


def normalize_source_camera(raw: dict[str, Any]) -> dict[str, Any]:
    cam = (
        raw.get("sourceCamera")
        or raw.get("source_camera")
        or {}
    )
    if not isinstance(cam, dict):
        cam = {}

    position = cam.get("position")
    target = cam.get("target")
    fov = (
        cam.get("fovYDegrees")
        or cam.get("fov_y_degrees")
        or cam.get("fovDegrees")
        or cam.get("fov")
    )
    rotation_q = cam.get("rotationQuaternion") or cam.get("rotation_quaternion")

    normalized: dict[str, Any] = {}
    if position is not None:
        normalized["position"] = position
    if target is not None:
        normalized["target"] = target
    if rotation_q is not None:
        normalized["rotationQuaternion"] = rotation_q
    if fov is not None:
        normalized["fovDegrees"] = fov
    for key in ("azimuthDeg", "elevationDeg"):
        if key in cam:
            normalized[key] = cam[key]
    return normalized


def build_gaussian_metadata(
    outputs: dict[str, str],
    metadata_doc: dict[str, Any] | None,
    response: dict[str, Any],
) -> dict[str, Any]:
    meta = metadata_doc or {}
    source_cam = normalize_source_camera(meta if meta else response)
    centroid = meta.get("centroid") or get_nested(response, "metadata", "centroid")
    bounds = meta.get("bounds") or get_nested(response, "metadata", "bounds")

    label = (
        meta.get("canonical_label")
        or meta.get("canonicalLabel")
        or meta.get("subject_label")
        or meta.get("subjectLabel")
        or meta.get("targetLabel")
        or response.get("canonical_label")
        or response.get("subject_label")
    )

    result: dict[str, Any] = {
        "sceneId": outputs.get("scene_id") or meta.get("sceneId") or "fast_gaussian_scene",
        "qualityTier": meta.get("qualityTier") or meta.get("view_quality") or "fast_rough",
        "centroid": centroid or [0.0, 0.5, 0.0],
        "bounds": bounds or {"min": [-1.0, 0.0, -1.0], "max": [1.0, 2.0, 1.0]},
        "pipeline": "fast",
    }
    if source_cam:
        result["sourceCamera"] = source_cam
    if outputs.get("sog_url"):
        result["sogUrl"] = outputs["sog_url"]
        result["assetUrls"] = {"sog": outputs["sog_url"]}
        if outputs.get("ply_url"):
            result["assetUrls"]["ply"] = outputs["ply_url"]
    if label:
        result["targetLabel"] = str(label)
    if meta.get("viewDependenceScore") is not None:
        result["viewDependenceScore"] = meta["viewDependenceScore"]
    elif meta.get("single_view_confidence") is not None:
        result["viewDependenceScore"] = float(meta["single_view_confidence"])
    return result


def submit_multipart(
    cfg: dict[str, Any],
    image_path: Path,
    mime: str,
) -> dict[str, Any]:
    url = urljoin(cfg["baseUrl"] + "/", cfg["submitEndpoint"].lstrip("/"))
    image_bytes = image_path.read_bytes()
    field_name = cfg.get("imageFieldName", "image")
    body, boundary = build_multipart_body(
        {},
        {field_name: (image_path.name, image_bytes, mime)},
    )
    return http_request(
        "POST",
        url,
        api_key=cfg["apiKey"],
        auth_header=cfg.get("authHeader", "Bearer"),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        data=body,
        timeout=float(cfg.get("timeoutSeconds", 300)),
    )


def submit_base64(cfg: dict[str, Any], image_path: Path, mime: str) -> dict[str, Any]:
    import base64

    url = urljoin(cfg["baseUrl"] + "/", cfg["submitEndpoint"].lstrip("/"))
    payload = {
        "image_base64": base64.b64encode(image_path.read_bytes()).decode("ascii"),
        "mime_type": mime,
        "filename": image_path.name,
    }
    data = json.dumps(payload).encode("utf-8")
    return http_request(
        "POST",
        url,
        api_key=cfg["apiKey"],
        auth_header=cfg.get("authHeader", "Bearer"),
        headers={"Content-Type": "application/json"},
        data=data,
        timeout=float(cfg.get("timeoutSeconds", 300)),
    )


def submit_presigned(cfg: dict[str, Any], image_path: Path, mime: str) -> dict[str, Any]:
    url = urljoin(cfg["baseUrl"] + "/", cfg["submitEndpoint"].lstrip("/"))
    init_payload = json.dumps({
        "filename": image_path.name,
        "content_type": mime,
    }).encode("utf-8")
    init_resp = http_request(
        "POST",
        url,
        api_key=cfg["apiKey"],
        auth_header=cfg.get("authHeader", "Bearer"),
        headers={"Content-Type": "application/json"},
        data=init_payload,
        timeout=60.0,
    )
    upload_url = init_resp.get("upload_url") or init_resp.get("uploadUrl")
    if not upload_url:
        raise RuntimeError("presigned flow: missing upload_url in submit response")
    upload_headers = init_resp.get("upload_headers") or init_resp.get("uploadHeaders") or {}
    if not isinstance(upload_headers, dict):
        upload_headers = {}
    put_headers = {str(k): str(v) for k, v in upload_headers.items()}
    if "Content-Type" not in put_headers:
        put_headers["Content-Type"] = mime
    put_request = urllib.request.Request(
        upload_url,
        data=image_path.read_bytes(),
        headers=put_headers,
        method="PUT",
    )
    try:
        with urllib.request.urlopen(put_request, timeout=120.0):
            pass
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"presigned PUT failed HTTP {exc.code}: {body[:300]}") from exc
    return init_resp


def poll_until_complete(cfg: dict[str, Any], task_id: str) -> dict[str, Any]:
    poll_template = cfg.get("pollEndpoint", "/tasks/{task_id}")
    poll_path = poll_template.format(task_id=task_id)
    poll_url = urljoin(cfg["baseUrl"] + "/", poll_path.lstrip("/"))
    deadline = time.time() + float(cfg.get("timeoutSeconds", 300))
    interval = float(cfg.get("pollIntervalSeconds", 2))

    while time.time() < deadline:
        result = http_request(
            "GET",
            poll_url,
            api_key=cfg["apiKey"],
            auth_header=cfg.get("authHeader", "Bearer"),
            timeout=60.0,
        )
        status = str(result.get("status", "")).lower()
        if status in ("completed", "succeeded", "success", "done"):
            return result
        if status in ("failed", "error", "cancelled", "canceled"):
            error = result.get("error") or result.get("message") or status
            raise RuntimeError(f"task {task_id} failed: {error}")
        time.sleep(interval)

    raise RuntimeError(f"task {task_id} timed out after {cfg.get('timeoutSeconds', 300)}s")


def call_api(cfg: dict[str, Any], image_path: Path, mime: str) -> dict[str, Any]:
    upload_mode = str(cfg.get("uploadMode", "multipart")).lower()
    if upload_mode == "multipart":
        response = submit_multipart(cfg, image_path, mime)
    elif upload_mode == "base64":
        response = submit_base64(cfg, image_path, mime)
    elif upload_mode == "presigned":
        response = submit_presigned(cfg, image_path, mime)
    else:
        raise RuntimeError(f"unsupported uploadMode: {upload_mode}")

    status = str(response.get("status", "")).lower()
    sync = bool(cfg.get("syncResponse")) or status in ("completed", "succeeded", "success", "done")

    if not sync:
        task_id = response.get("task_id") or response.get("taskId")
        if not task_id:
            outputs = extract_outputs(response)
            if outputs.get("sog_url"):
                response["status"] = "completed"
                return response
            raise RuntimeError("async response missing task_id and sog_url")
        response = poll_until_complete(cfg, str(task_id))

    final_status = str(response.get("status", "")).lower()
    if final_status and final_status not in ("completed", "succeeded", "success", "done"):
        raise RuntimeError(f"unexpected final status: {response.get('status')}")

    outputs = extract_outputs(response)
    if not outputs.get("sog_url"):
        raise RuntimeError("API completed but sog_url is missing — cannot build angle game")

    return response


def process_api_response(
    cfg: dict[str, Any],
    response: dict[str, Any],
    output_dir: Path,
    image_path: Path,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    copy_source_image(image_path, output_dir)

    outputs = extract_outputs(response)
    metadata_doc: dict[str, Any] | None = None

    metadata_url = outputs.get("metadata_url")
    if metadata_url:
        try:
            metadata_doc = download_json(
                metadata_url,
                api_key=cfg["apiKey"],
                auth_header=cfg.get("authHeader", "Bearer"),
            )
        except RuntimeError as exc:
            print(f"WARNING: could not download metadata_url: {exc}", file=sys.stderr)

    embedded = response.get("metadata")
    if metadata_doc is None and isinstance(embedded, dict):
        metadata_doc = embedded

    gaussian_metadata = build_gaussian_metadata(outputs, metadata_doc, response)
    if not gaussian_metadata.get("sourceCamera"):
        print(
            "WARNING: sourceCamera missing from API metadata; "
            "clarity curve will use inferred defaults",
            file=sys.stderr,
        )

    save_json(output_dir / "api-response.json", response)
    save_json(output_dir / "asset-urls.json", outputs)
    save_json(output_dir / "gaussian-metadata.json", gaussian_metadata)


def main() -> int:
    parser = argparse.ArgumentParser(description="Request fast rough Gaussian scene from company API")
    parser.add_argument("image", type=Path, help="Input scene image (jpg/png/webp)")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("output-angle-game/assets"),
        help="Output assets directory (default: output-angle-game/assets)",
    )
    parser.add_argument("--config", type=Path, help="Optional API config JSON")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Skip API call; write placeholder response and copy image",
    )
    parser.add_argument(
        "--mock",
        choices=["coffee_mug", "vase_symmetric", "workshop_no_camera"],
        help="Write mock metadata without calling API (legacy simulation)",
    )
    args = parser.parse_args()

    if args.mock:
        if args.mock not in MOCK_METADATA:
            # map legacy name
            legacy_map = {"vase_symmetric": "sphere_symmetric", "workshop_no_camera": "coffee_mug"}
            mock_key = legacy_map.get(args.mock, args.mock)
        else:
            mock_key = args.mock
        if mock_key not in MOCK_METADATA:
            print(f"ERROR: unknown mock key: {args.mock}", file=sys.stderr)
            return 1
        write_mock_outputs(args.output_dir, mock_key)
        print(f"Wrote mock metadata for {mock_key}")
        return 0

    try:
        mime = validate_image(args.image)
    except (FileNotFoundError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    config_path = resolve_config_path(args.config)
    cfg = load_api_config(config_path)

    if args.dry_run or not is_configured(cfg):
        reason = "dry-run mode" if args.dry_run else "API URL/key not configured"
        if not args.dry_run:
            print(
                "WARNING: FAST_GAUSSIAN_API_URL / FAST_GAUSSIAN_API_KEY not set; "
                "writing placeholder outputs",
                file=sys.stderr,
            )
        write_placeholder_outputs(args.output_dir, args.image, reason=reason, dry_run=args.dry_run)
        print(f"Placeholder assets written to {args.output_dir}")
        return 0

    print(f"Using fast API at {cfg['baseUrl']} (key {mask_api_key(cfg['apiKey'])})")
    print("NOTE: Calling company fast Gaussian API; do not rebuild Gaussian locally.")

    try:
        response = call_api(cfg, args.image, mime)
        process_api_response(cfg, response, args.output_dir, args.image)
    except RuntimeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    outputs = extract_outputs(response)
    print(f"scene_id: {outputs.get('scene_id', '(unknown)')}")
    print(f"sog_url: {outputs.get('sog_url', '')}")
    if outputs.get("metadata_url"):
        print(f"metadata_url: {outputs['metadata_url']}")
    print(f"Wrote gaussian-metadata.json to {args.output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
