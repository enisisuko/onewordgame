# Clarity Model

Maps viewing angle → **clarity score** (0–1). Peaks at API `source_camera` (canonical / truth angle).

## Coordinate System

- **Centroid** `C`: orbit pivot from `gaussian-metadata.json`
- **View direction** `V`: normalized vector from camera position to `C` (or inverse for splat-rotate mode)
- **Truth direction** `T`: normalized vector from `source_camera.position` toward `source_camera.target`

## Angular Distance

Primary metric: angle between view rays in 3D:

```text
Δθ = arccos(clamp(dot(V, T), -1, 1))   // radians
Δθ_deg = degrees(Δθ)
```

Optional elevation weighting (emphasize horizontal orbit):

```text
Δθ_weighted = sqrt((Δazimuth * w_az)² + (Δelevation * w_el)²)
```

Defaults: `w_az = 1.0`, `w_el = 0.6` (elevation less punishing on mobile).

## Clarity Function

Gaussian-like peak (smooth, differentiable for runtime lerp):

```text
clarity(Δθ) = exp(-(Δθ / σ)²)
```

| Parameter | Default | Notes |
|-----------|---------|-------|
| `σ` (sigma) | `peakWidthDeg * π/180 / 2` | from `clarity-curve.json` |
| `floor` | 0.08 | minimum clarity off-peak |
| `ceiling` | 1.0 | at Δθ = 0 |

Runtime formula with floor:

```text
clarity = floor + (ceiling - floor) * exp(-(Δθ/σ)²)
```

## Visual Mapping

| Clarity range | Visual treatment |
|---------------|------------------|
| 0.00 – 0.25 | Heavy blur, 40–60% opacity, visible noise |
| 0.25 – 0.55 | Medium blur, opacity ramps 60–85% |
| 0.55 – 0.80 | Light blur, near-full opacity |
| 0.80 – 1.00 | Sharp, full opacity, optional highlight rim |

Implement in PlayCanvas via shader uniform `uClarity` or post-effect blend.

## Sampling for clarity-curve.json

`build_clarity_curve.py` samples azimuth −180°…180° (step 5°) at fixed elevation = truth elevation:

```json
{
  "samples": [
    { "azimuthDeg": -90, "elevationDeg": 15, "clarity": 0.12 },
    { "azimuthDeg": 0, "elevationDeg": 15, "clarity": 1.0 }
  ],
  "peakAzimuthDeg": 0,
  "peakWidthDeg": 25,
  "sigmaRad": 0.218
}
```

## Feasibility Heuristics

| Check | Threshold | Fail action |
|-------|-----------|-------------|
| Peak clarity at truth | ≥ 0.95 | OK |
| Off-peak mean (|Δθ|>45°) | ≤ 0.35 | OK |
| Secondary peaks > 0.7 | count ≤ 1 | else symmetry risk |
| `peakWidthDeg` | 10–45 | too narrow = frustrating; too wide = trivial |

`symmetryRisk` = count of azimuths with clarity > 0.7 divided by total samples.

## Multi-Peak / Symmetric Objects

Vase, ball, apple-like shapes may have multiple high-clarity angles. Set `angle-feasibility.json`:

```json
{
  "suitable": false,
  "symmetryRisk": 0.82,
  "recommendedMode": "multi_choice_reveal",
  "reason": "multiple clarity peaks within 30°"
}
```

Widen gameplay: clarity still helps but win requires correct multiple-choice answer.

## Mobile Considerations

- Coarser drag sampling OK (30fps clarity update)
- Haptic pulse when crossing clarity 0.8 (if platform supports)
- Snap-to-peak disabled by default (preserves puzzle)
