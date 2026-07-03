# Orbit Controls

Camera orbit and splat rotation patterns for the angle-finder game. PlayCanvas-first; principles apply to other engines.

## Mode A: Orbit Camera (Recommended)

Camera orbits fixed splat at `centroid`.

### Parameters

| Param | Default | Description |
|-------|---------|-------------|
| `orbitRadius` | auto from bounds | distance camera to centroid |
| `minRadius` | 0.5 × auto | zoom in limit |
| `maxRadius` | 2.0 × auto | zoom out limit |
| `minElevationDeg` | -10 | prevent going under floor |
| `maxElevationDeg` | 75 | prevent gimbal flip |
| `rotateSpeed` | 0.3 | radians per pixel (desktop) |
| `touchRotateSpeed` | 0.4 | mobile multiplier |
| `damping` | 0.92 | inertia decay per frame |
| `enableZoom` | true | wheel / pinch |

### Desktop Input

- **LMB drag**: azimuth += Δx * rotateSpeed, elevation += Δy * rotateSpeed
- **Wheel**: radius *= (1 - Δwheel * 0.001)

### Mobile Input (Loopit)

- **Single finger drag**: same as LMB
- **Two finger pinch**: zoom radius
- Set `touch-action: none` on canvas container
- Ignore drags starting on UI elements (clarity bar, guess panel)

### PlayCanvas Script Sketch

```javascript
// orbit-camera.js — attributes: target (Vec3), distance, min/max elevation
OrbitCamera.prototype.update = function (dt) {
    if (this._dragging) {
        this._azimuth -= this._dx * this.rotateSpeed;
        this._elevation = pc.math.clamp(
            this._elevation - this._dy * this.rotateSpeed,
            this.minElevation * pc.math.DEG_TO_RAD,
            this.maxElevation * pc.math.DEG_TO_RAD
        );
    }
    var pos = new pc.Vec3();
    pos.set(
        Math.sin(this._azimuth) * Math.cos(this._elevation),
        Math.sin(this._elevation),
        Math.cos(this._azimuth) * Math.cos(this._elevation)
    ).mulScalar(this.distance).add(this.target);
    this.entity.setPosition(pos);
    this.entity.lookAt(this.target);
    this._dx = this._dy = 0;
};
```

Wire `pointerdown/move/up` and `touchstart/move/end` on `app.mouse` / `app.touch`.

## Mode B: Rotate Splat

Camera fixed; rotate `SplatRoot` entity.

- **Y-axis primary**: `entity.rotateLocal(0, -Δx * speed, 0)`
- Optional X tilt clamped ±15°
- Clarity computed from splat rotation vs inverse truth quaternion

Use when splat asset origin is unreliable for orbit pivot.

## Rotation Budget (Optional Pressure)

Track cumulative angular change per session:

```text
budgetUsed += abs(Δazimuth) + abs(Δelevation) * 0.5
```

Fail when `budgetUsed > rotationBudgetRad` (default: 2π × 3 = ~3 full spins).

Display remaining budget as arc meter in UI.

## Compass UI

- Show current azimuth relative to truth (not absolute world north)
- Optional: ghost marker at truth direction when hint purchased
- Color: red (cold) → green (warm) by clarity

## Clarity Controller Hook

Each frame after camera/splat update:

```javascript
var clarity = ClarityModel.evaluate(cameraPos, target, truthCamera);
this.splatMaterial.setParameter('u_clarity', clarity);
this.events.fire('clarity:changed', clarity);
```

## Performance

- Update clarity at 30Hz if splat heavy; interpolate visuals
- Disable damping on low-end mobile if janky
- Precompute clarity LUT from `clarity-curve.json` for O(1) lookup by azimuth bin

## Reference Implementation

See `C:\WORKS\playcanvas` for camera rig patterns. Angle-finder does **not** need FPS `interactDistance` or billboard pick — orbit only.
