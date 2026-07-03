# Fast Gaussian API Contract

Company **fast image→Gaussian** pipeline: optimized for speed, accepts single canonical view, output is intentionally rough.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FAST_GAUSSIAN_API_URL` | ✓ | Base URL for fast pipeline (fallback: `GAUSSIAN_API_URL`) |
| `GAUSSIAN_API_KEY` | ✓ | Bearer token or API key |
| `GAUSSIAN_API_TOKEN` | alt | Alias for key |

Never commit keys. Read from env or local `config.json` gitignored.

## Discovery Order

1. Project existing Gaussian client (`request_gaussian_api.py` in sibling skill)
2. Env vars above
3. Local `--config` JSON: `{ "baseUrl": "...", "apiKeyEnv": "GAUSSIAN_API_KEY", "pipeline": "fast" }`
4. Ask user for credentials if missing

## Async Workflow

```text
POST /v1/fast/gaussian  (multipart: image)
  → { "task_id": "...", "status": "pending" }

GET /v1/tasks/{task_id}
  → { "status": "completed", "outputs": { ... } }
```

Poll interval: 1–3s, timeout: 120s (fast pipeline should complete < 30s).

## Expected Response Fields

| Field | Type | Required for angle game |
|-------|------|-------------------------|
| `scene_id` | string | ✓ |
| `sog_url` | string | ✓ (preferred) |
| `ply_url` | string | fallback |
| `metadata.source_camera` | `{ position, target, fov }` | ✓ **truth angle** |
| `metadata.centroid` | `[x,y,z]` | ✓ orbit pivot |
| `metadata.bounds` | `{ min, max }` | ✓ framing |
| `metadata.subject_label` | string | optional correct answer |
| `metadata.view_quality` | `rough` \| `medium` | expect `rough` |
| `metadata.single_view_confidence` | 0–1 | feasibility input |

### source_camera Schema

```json
{
  "position": [0, 1.2, 3.5],
  "target": [0, 0.5, 0],
  "fov": 60,
  "azimuthDeg": 0,
  "elevationDeg": 15
}
```

`azimuthDeg` / `elevationDeg` are spherical coords relative to centroid if provided; otherwise derive from position−target.

## Missing Metadata Fallback

If `source_camera` absent:

1. Assume camera faces centroid from +Z with elevation 15°
2. Set `angle-feasibility.json` → `inferredCamera: true`
3. Widen clarity peak (`peakWidthDeg` += 20)
4. If still low confidence → `multi_choice_reveal` mode

## Error Handling

| Status | Action |
|--------|--------|
| 401/403 | Stop; ask user to fix API key |
| 422 | Invalid image; report to user |
| 504/timeout | Retry once; then fail with BUILD_REPORT note |
| completed but no sog | Fail; cannot build angle game |

## Relationship to Full Pipeline

Fast pipeline **does not** guarantee `labels_url`, `collision_url`, or multi-view consistency. Do not block angle game on missing labels.

Sibling skill `labeled-gaussian-game-generator` uses full pipeline; share transport code, not response assumptions.
