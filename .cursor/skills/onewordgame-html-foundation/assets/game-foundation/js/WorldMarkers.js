import * as THREE from 'three';

/**
 * WM_* 范围触发器 — 对标 PlayCanvas worldMarker + marker:touch。
 */
export class WorldMarkers {
  constructor(scene, markers, onEnter) {
    this.scene = scene;
    this.onEnter = onEnter;
    this.markers = markers.map((m) => ({
      ...m,
      position: new THREE.Vector3(...m.position),
      entered: false,
      mesh: null,
    }));

    this._group = new THREE.Group();
    this._group.name = 'WorldMarkers';
    scene.add(this._group);

    for (const m of this.markers) {
      m.mesh = this._createVisual(m);
      this._group.add(m.mesh);
    }
  }

  _createVisual(marker) {
    const group = new THREE.Group();
    group.position.copy(marker.position);
    group.name = marker.id;

    const coneGeo = new THREE.ConeGeometry(0.22, 0.5, 8);
    const coneMat = new THREE.MeshStandardMaterial({
      color: marker.color ?? 0x7ee8fa,
      emissive: marker.color ?? 0x2a6a88,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.85,
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.rotation.x = Math.PI;
    cone.position.y = 0.55;
    group.add(cone);

    const ringGeo = new THREE.RingGeometry(0.35, 0.55, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: marker.color ?? 0x5ddf8a,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    group.add(ring);

    return group;
  }

  update(playerPos, dt) {
    const px = playerPos.x;
    const pz = playerPos.z;

    for (const m of this.markers) {
      const dx = px - m.position.x;
      const dz = pz - m.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const inside = dist <= m.radius;

      if (m.mesh) {
        m.mesh.position.y = m.position.y + Math.sin(performance.now() * 0.003 + m.position.x) * 0.04;
        const scale = inside ? 1.15 : 1;
        m.mesh.scale.setScalar(scale);
      }

      if (inside && !m.entered) {
        m.entered = true;
        this.onEnter?.({
          type: m.type,
          marker: m.id,
          label: m.label,
        });
      } else if (!inside) {
        m.entered = false;
      }
    }
  }

  setVisible(visible) {
    this._group.visible = visible;
  }
}
