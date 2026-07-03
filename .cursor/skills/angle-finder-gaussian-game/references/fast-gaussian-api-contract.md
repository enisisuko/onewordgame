# Fast Gaussian API Contract (Angle Finder Game)

Company **fast image→Gaussian** pipeline for the angle-finder skill: single canonical view, intentionally rough output, optimized for speed. **This skill does not implement reconstruction** — it discovers and calls your existing company API client or REST endpoints.

> **Sibling skill:** For the full labeled-scene pipeline (semantic labels, collision, multi-mechanic games), see `labeled-gaussian-game-generator/references/gaussian-api-contract.md`. For fast rough single-view angle puzzles, use **this** contract.

---

## Discovery (mandatory first step)

Before adding transport code, search the project for an existing Gaussian client:

1. Scripts: `labeled-gaussian-game-generator/scripts/request_gaussian_api.py`, any `*gaussian*client*`
2. Env vars: `FAST_GAUSSIAN_API_URL`, `GAUSSIAN_API_URL`, `FAST_GAUSSIAN_API_KEY`, `GAUSSIAN_API_KEY`
3. Config files: `gaussian-api.config.json` (gitignored), `FAST_GAUSSIAN_API_CONFIG` path
4. API docs, OpenAPI specs, TypeScript/Python types, example responses

**Do not create a second reconstruction pipeline.** Extend or wrap the project client; `scripts/request_fast_gaussian_api.py` is the skill’s thin CLI wrapper.

---

## Image input methods

All supported ways to provide the source scene image:

| Method | Who uses it | Where it lands | Next step |
|--------|-------------|----------------|-----------|
| **Local file path (CLI)** | Developer / agent | User path as-is | `prepare_image_upload.py` then `request_fast_gaussian_api.py <path>` |
| **Drag-drop / chat upload (Cursor)** | End user in chat | Agent saves to `output-angle-game/input/source-image.{jpg\|png\|webp}` | Run `prepare_image_upload.py` on saved path |
| **HTTP multipart** | `request_fast_gaussian_api.py` (default `uploadMode`) | POST body to company `submitEndpoint` | API returns assets |
| **Base64 in JSON** | APIs that accept JSON bodies | `uploadMode: "base64"` in config | `{ "image_base64": "...", "mime_type": "image/jpeg" }` |
| **Pre-signed URL** | Async pipelines with object storage | `uploadMode: "presigned_url"` | GET presign → PUT image → POST `upload_id` to submit |

### Recommended agent workflow (chat upload)

```text
User attaches image in Cursor chat
  → Agent writes bytes to a temp or output path
  → python scripts/prepare_image_upload.py <path>
       → output-angle-game/input/source-image.jpg
       → output-angle-game/input/upload-manifest.json
  → python scripts/request_fast_gaussian_api.py output-angle-game/input/source-image.jpg \
       --output-dir output-angle-game/assets [--config gaussian-api.config.json]
  → python scripts/build_clarity_curve.py output-angle-game/assets/gaussian-metadata.json ...
```

`upload-manifest.json` records `localPath`, `mimeType`, `sizeBytes`, `sha256`, and dimensions when detectable (stdlib header parse, no PIL).

---

## Environment variables

Never commit values. Set in shell, CI secrets, or local `.env` (gitignored).

| Variable | Required | Description |
|----------|----------|-------------|
| `FAST_GAUSSIAN_API_URL` | ✓ (or config `baseUrl`) | Base URL for fast pipeline |
| `GAUSSIAN_API_URL` | fallback | Shared base URL if fast-specific unset |
| `FAST_GAUSSIAN_API_KEY` | ✓ (or config `apiKeyEnv`) | Bearer / API key for fast pipeline |
| `GAUSSIAN_API_KEY` | fallback | Shared key alias |
| `GAUSSIAN_API_TOKEN` | alt | Another common alias |
| `FAST_GAUSSIAN_API_CONFIG` | optional | Path to local JSON config file |

Config file template (copy from skill, **no secrets**):

`templates/gaussian-api.config.json.example` → copy to repo root as `gaussian-api.config.json` (gitignored).

```json
{
  "baseUrl": "https://api.example.com/v1",
  "apiKeyEnv": "FAST_GAUSSIAN_API_KEY",
  "submitEndpoint": "/gaussian/fast",
  "pollEndpoint": "/tasks/{task_id}",
  "uploadMode": "multipart",
  "timeoutSeconds": 300,
  "pollIntervalSeconds": 2
}
```

| Field | Description |
|-------|-------------|
| `baseUrl` | API origin without trailing slash |
| `apiKeyEnv` | Name of env var holding the secret (not the secret itself) |
| `submitEndpoint` | POST path for image submission |
| `pollEndpoint` | GET path template; `{task_id}` replaced for async jobs |
| `uploadMode` | `multipart` (default), `base64`, or `presigned_url` |
| `presignEndpoint` | Required when `uploadMode` is `presigned_url` |
| `timeoutSeconds` | Submit + total poll budget |
| `pollIntervalSeconds` | Sleep between poll requests |

---

## API flows

### Synchronous (immediate result)

```text
POST {baseUrl}{submitEndpoint}
  Content-Type: multipart/form-data  (field name: image)
  Authorization: Bearer <key>

→ 200 {
     "status": "completed",
     "scene_id": "...",
     "outputs": {
       "sog_url": "https://...",
       "metadata_url": "https://...",
       "thumbnail_url": "https://..."   // optional
     }
   }
```

Skill writes `output-angle-game/assets/api-response.json`, `gaussian-metadata.json`, `asset-urls.json`.

### Asynchronous (submit → poll → download)

```text
POST {baseUrl}{submitEndpoint}  (multipart image)
  → { "task_id": "abc123", "status": "pending" }

GET {baseUrl}/tasks/abc123   (poll every pollIntervalSeconds)
  → { "status": "running" }
  → { "status": "completed", "outputs": { ... } }
```

Poll until `status` ∈ `completed` | `succeeded` | `success` | `done`, or fail on `failed` | `error` | timeout.

---

## Expected response fields (angle-finder game)

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| `sog_url` | string | **✓** | Gaussian splat asset for PlayCanvas |
| `metadata_url` | string | **✓** (or inline `metadata`) | JSON with `sourceCamera` — **critical for clarity curve** |
| `metadata.sourceCamera.position` | `[x,y,z]` | ✓ | Canonical camera position |
| `metadata.sourceCamera.rotationQuaternion` | `[x,y,z,w]` | optional | Alternative to position/target |
| `metadata.sourceCamera.fovYDegrees` | number | recommended | Vertical FOV for framing |
| `metadata.centroid` | `[x,y,z]` | recommended | Orbit pivot |
| `metadata.bounds` | `{ min, max }` | recommended | Scene framing |
| `ply_url` | string | optional | Fallback splat format |
| `thumbnail_url` | string | optional | UI preview |
| `scene_id` | string | recommended | Traceability |
| `canonical_label` | string | optional | Ground-truth label for win condition |

### `sourceCamera` schema (truth angle)

```json
{
  "position": [0, 1.2, 3.5],
  "target": [0, 0.5, 0],
  "rotationQuaternion": [0, 0, 0, 1],
  "fovYDegrees": 60,
  "azimuthDeg": 0,
  "elevationDeg": 15
}
```

`azimuthDeg` / `elevationDeg` may be provided relative to `centroid`; otherwise derive from `position` − `centroid`. Clarity peak must align with this camera — see `references/clarity-model.md`.

### Skill output files

| File | Contents |
|------|----------|
| `assets/api-response.json` | Raw API response (may contain signed URLs — gitignore optional) |
| `assets/gaussian-metadata.json` | Normalized metadata for `build_clarity_curve.py` |
| `assets/asset-urls.json` | Manifest: `sog_url`, `metadata_url`, `ply_url`, `thumbnail_url`, `scene_id` |
| `input/source-image.*` | Normalized upload copy |
| `input/upload-manifest.json` | Local path, mime, sha256, dimensions |

---

## Security rules

- **Never** put API keys in frontend code, Git, skill templates, or example JSON.
- **Never** log full keys; mask to first 4 characters (`abcd...`).
- **Never** commit `.env`, `gaussian-api.config.json` with real endpoints/keys.
- Signed asset URLs in `api-response.json` may be sensitive — consider gitignoring `output-angle-game/assets/api-response.json`.
- User photos follow project privacy policy; do not re-upload to third parties outside company API.

---

## Error handling

| Condition | Action |
|-----------|--------|
| 401 / 403 | Stop; user fixes key or `apiKeyEnv` |
| 422 | Invalid image; show API message |
| 504 / timeout | Retry submit once if documented; else fail with BUILD_REPORT note |
| `completed` but no `sog_url` | Fail — cannot build angle game |
| Missing `sourceCamera` | Warn; infer defaults; widen clarity peak; may downgrade to multi-choice |

---

## Offline / dry-run development

```bash
# Normalize upload only
python scripts/prepare_image_upload.py path/to/photo.jpg

# Placeholder API response (no network)
python scripts/request_fast_gaussian_api.py output-angle-game/input/source-image.jpg \
  --output-dir output-angle-game/assets --dry-run

# Mock metadata scenarios
python scripts/request_fast_gaussian_api.py dummy.jpg --output-dir output-angle-game/assets --mock coffee_mug
```

When URL/key are missing, `request_fast_gaussian_api.py` automatically behaves like `--dry-run` and copies the image to `output-angle-game/input/`.

---

## Relationship to full labeled pipeline

| | Fast (this contract) | Full (`gaussian-api-contract.md`) |
|--|----------------------|-----------------------------------|
| Speed | Seconds | Minutes |
| Views | Single canonical | Multi-view / labeled |
| Labels | Optional `canonical_label` | Required semantic labels |
| Game skill | `angle-finder-gaussian-game` | `labeled-gaussian-game-generator` |
| Shared | Env discovery, config pattern, no in-skill reconstruction | Same |

Transport code may be shared; **response assumptions are not.**
