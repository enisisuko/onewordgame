import * as THREE from 'three';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const TEMP_DIR = new THREE.Vector3();
const TEMP_MID = new THREE.Vector3();
const TEMP_QUAT = new THREE.Quaternion();
const TEMP_EULER = new THREE.Euler(0, 0, 0, 'YXZ');
const TEMP_POINTS = Array.from({ length: 8 }, () => new THREE.Vector3());

function alignCylinder(mesh, from, to) {
  TEMP_DIR.subVectors(to, from);
  const len = TEMP_DIR.length();
  if (len <= 0.0001) {
    mesh.visible = false;
    return;
  }

  mesh.visible = true;
  TEMP_MID.addVectors(from, to).multiplyScalar(0.5);
  mesh.position.copy(TEMP_MID);
  TEMP_QUAT.setFromUnitVectors(Y_AXIS, TEMP_DIR.normalize());
  mesh.quaternion.copy(TEMP_QUAT);
  mesh.scale.set(1, len, 1);
}

function markNoFocus(obj) {
  obj.userData.dofIgnoreFocus = true;
  obj.traverse?.((child) => {
    child.userData.dofIgnoreFocus = true;
  });
}

function copyCameraTransform(root, camera) {
  camera.updateMatrixWorld(true);
  camera.matrixWorld.decompose(root.position, root.quaternion, root.scale);
  root.scale.set(1, 1, 1);
}

export class FirstPersonRod {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.name = 'FirstPersonRod';
    this.proxyRoot = new THREE.Group();
    this.proxyRoot.name = 'DofProxyFirstPersonRod';
    markNoFocus(this.proxyRoot);

    this._modelScale = 0.9;
    this._time = 0;
    this._lastCameraPos = new THREE.Vector3();
    this._lastCameraQuat = new THREE.Quaternion();
    this._cameraQuatReady = false;
    this._cameraSpeed = 0;
    this._viewLag = new THREE.Vector3();
    this._hookLocal = new THREE.Vector3(0.022, -0.36, -1.35);
    this._hookVelocity = new THREE.Vector3();
    this._tipLocal = new THREE.Vector3();
    this._linePoints = TEMP_POINTS.map((p) => p.clone());
    this._linePositions = new Float32Array(this._linePoints.length * 3);

    this._baseButt = new THREE.Vector3(0.145, -0.31, -0.50);
    this._baseGrip = new THREE.Vector3(0.115, -0.265, -0.62);
    this._baseTip = new THREE.Vector3(0.018, -0.055, -1.72);
    this._baseHook = new THREE.Vector3(0.022, -0.36, -1.35);
    this._handOffset = new THREE.Vector3(0.0, -0.045, 0.015);
    this._castCharge = 0;
    this._castKick = 0;
    this._biteKick = 0;
    this._hookSetKick = 0;
    this._successKick = 0;
    this._failKick = 0;
    this._lineCast = 0;
    this._fightTension = 0;
    this._reeling = false;
    this._reelPhase = 0;

    this._materials = this._createMaterials();
    this._proxyMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      colorWrite: false,
      depthWrite: true,
      depthTest: true,
    });

    this._buildVisibleRod();
    this._buildProxyRod();

    scene.add(this.root);
  }

  handleFishingAction(action) {
    const type = action?.type;
    if (!type) return;

    switch (type) {
      case 'ready':
        this._castCharge = 0;
        this._fightTension = 0;
        this._reeling = false;
        this._hookVelocity.add(new THREE.Vector3(0.02, -0.02, 0.08));
        break;
      case 'stow':
        this._castCharge = 0;
        this._fightTension = 0;
        this._reeling = false;
        this._hookVelocity.add(new THREE.Vector3(-0.02, 0.0, 0.04));
        break;
      case 'castChargeStart':
        this._castCharge = Math.max(this._castCharge, 0.18);
        this._hookVelocity.add(new THREE.Vector3(0.03, 0.04, 0.14));
        break;
      case 'castCharge':
        this._castCharge = Math.max(this._castCharge, THREE.MathUtils.clamp(action.charge ?? 0, 0, 1));
        break;
      case 'castRelease': {
        const power = THREE.MathUtils.clamp(action.power ?? 0.65, 0.06, 1);
        this._castCharge = 0;
        this._castKick = Math.max(this._castKick, 1.35);
        this._lineCast = Math.max(this._lineCast, power * 1.2);
        this._hookVelocity.add(new THREE.Vector3(-0.18 * power, 0.46 * power, -2.25 * power));
        break;
      }
      case 'lineLanded':
        this._lineCast = Math.max(this._lineCast, 0.55);
        this._hookVelocity.add(new THREE.Vector3(0.04, -0.48, 0.32));
        break;
      case 'bite':
        this._biteKick = Math.max(this._biteKick, 1.35);
        this._hookVelocity.add(new THREE.Vector3(0.18, -0.36, 0.14));
        break;
      case 'hookSet':
        this._hookSetKick = Math.max(this._hookSetKick, 1.45);
        this._fightTension = 0.65;
        this._hookVelocity.add(new THREE.Vector3(-0.12, 0.66, 0.92));
        break;
      case 'reelStart':
        this._reeling = true;
        this._hookVelocity.add(new THREE.Vector3(0.0, 0.06, 0.16));
        break;
      case 'reelStop':
        this._reeling = false;
        break;
      case 'fightTick':
        this._reeling = !!action.reeling;
        this._fightTension = THREE.MathUtils.lerp(
          this._fightTension,
          action.inZone ? 0.62 : 0.88,
          0.12,
        );
        break;
      case 'catchSuccess':
        this._successKick = Math.max(this._successKick, 1.25);
        this._fightTension = 0.15;
        this._reeling = false;
        this._hookVelocity.add(new THREE.Vector3(0.05, 0.52, 0.92));
        break;
      case 'catchFail':
      case 'miss':
        this._failKick = Math.max(this._failKick, 1.2);
        this._fightTension = 0.0;
        this._reeling = false;
        this._hookVelocity.add(new THREE.Vector3(0.08, -0.34, -0.24));
        break;
      default:
        break;
    }
  }

  _createMaterials() {
    const materials = {
      grip: new THREE.MeshStandardMaterial({
        color: 0x2a1b12,
        roughness: 0.85,
        metalness: 0.05,
      }),
      wrap: new THREE.MeshStandardMaterial({
        color: 0xd69a4a,
        roughness: 0.65,
        metalness: 0.08,
      }),
      rod: new THREE.MeshStandardMaterial({
        color: 0x4b3822,
        roughness: 0.72,
        metalness: 0.12,
      }),
      metal: new THREE.MeshStandardMaterial({
        color: 0xcad7df,
        roughness: 0.34,
        metalness: 0.55,
      }),
      hook: new THREE.MeshStandardMaterial({
        color: 0xe8eef2,
        roughness: 0.28,
        metalness: 0.72,
      }),
      bait: new THREE.MeshStandardMaterial({
        color: 0xff4f5f,
        emissive: 0x4a050b,
        emissiveIntensity: 0.18,
        roughness: 0.48,
      }),
      hand: new THREE.MeshStandardMaterial({
        color: 0xd79a6b,
        roughness: 0.78,
        metalness: 0.02,
      }),
      sleeve: new THREE.MeshStandardMaterial({
        color: 0x16384a,
        roughness: 0.82,
        metalness: 0.03,
      }),
      line: new THREE.LineBasicMaterial({
        color: 0xeaf8ff,
        transparent: true,
        opacity: 0.78,
      }),
    };
    Object.values(materials).forEach((material) => {
      material.transparent = true;
      material.opacity = material.opacity ?? 1.0;
      material.depthTest = false;
      material.depthWrite = false;
      material.needsUpdate = true;
    });
    return materials;
  }

  _createSegment(radius, material, name, radialSegments = 8) {
    const geometry = new THREE.CylinderGeometry(radius, radius, 1, radialSegments);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.frustumCulled = false;
    return mesh;
  }

  _buildVisibleRod() {
    this._grip = this._createSegment(0.024, this._materials.grip, 'FishingRod.grip', 10);
    this._shaft = this._createSegment(0.010, this._materials.rod, 'FishingRod.shaft', 8);
    this._tip = new THREE.Mesh(new THREE.SphereGeometry(0.021, 12, 8), this._materials.metal);
    this._tip.name = 'FishingRod.tip';
    this._tip.frustumCulled = false;

    this._wraps = [0.18, 0.42, 0.67].map((t, i) => {
      const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.018 - i * 0.002, 0.0028, 6, 18), this._materials.wrap);
      wrap.name = `FishingRod.wrap-${i + 1}`;
      wrap.frustumCulled = false;
      return { t, mesh: wrap };
    });

    this._lineGeometry = new THREE.BufferGeometry();
    this._lineGeometry.setAttribute('position', new THREE.BufferAttribute(this._linePositions, 3));
    this._line = new THREE.Line(this._lineGeometry, this._materials.line);
    this._line.name = 'FishingRod.line';
    this._line.frustumCulled = false;

    this._hookGroup = new THREE.Group();
    this._hookGroup.name = 'FishingRod.hook';
    this._hookGroup.frustumCulled = false;
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.033, 0.0044, 8, 20, Math.PI * 1.45), this._materials.hook);
    hook.rotation.set(Math.PI * 0.58, 0.0, Math.PI * 0.18);
    hook.position.y = -0.012;
    const barb = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.028, 8), this._materials.hook);
    barb.rotation.z = -0.55;
    barb.position.set(0.022, -0.035, 0.0);
    const bait = new THREE.Mesh(new THREE.SphereGeometry(0.024, 12, 8), this._materials.bait);
    bait.position.set(-0.008, -0.044, 0.0);
    this._hookGroup.add(hook, barb, bait);

    this._handGroup = new THREE.Group();
    this._handGroup.name = 'FishingRod.hand';
    this._handGroup.frustumCulled = false;
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.072, 0.115), this._materials.sleeve);
    sleeve.position.set(0.02, -0.018, 0.016);
    sleeve.rotation.set(0.05, -0.12, -0.08);
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.064, 0.092), this._materials.hand);
    fist.position.set(-0.018, 0.012, -0.028);
    fist.rotation.set(0.04, 0.1, 0.16);
    this._handGroup.add(sleeve, fist);

    this.root.add(this._grip, this._shaft, this._tip, this._line, this._hookGroup, this._handGroup);
    this._wraps.forEach(({ mesh }) => this.root.add(mesh));
    this.root.traverse((obj) => {
      obj.renderOrder = 100000;
    });
  }

  _buildProxyRod() {
    this._proxyGrip = this._createSegment(0.034, this._proxyMaterial, 'dof-proxy-first-person-rod-grip', 8);
    this._proxyShaft = this._createSegment(0.018, this._proxyMaterial, 'dof-proxy-first-person-rod-shaft', 8);
    this._proxyTip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), this._proxyMaterial);
    this._proxyTip.name = 'dof-proxy-first-person-rod-tip';
    this._proxyHook = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), this._proxyMaterial);
    this._proxyHook.name = 'dof-proxy-first-person-rod-hook';
    this._proxyHand = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.10, 0.13), this._proxyMaterial);
    this._proxyHand.name = 'dof-proxy-first-person-hand';
    this._proxyLineSegments = Array.from({ length: this._linePoints.length - 1 }, (_, i) => {
      return this._createSegment(0.009, this._proxyMaterial, `dof-proxy-first-person-line-${i + 1}`, 6);
    });

    this.proxyRoot.add(this._proxyGrip, this._proxyShaft, this._proxyTip, this._proxyHook, this._proxyHand, ...this._proxyLineSegments);
    markNoFocus(this.proxyRoot);
  }

  update(dt, camera, moving = false) {
    const safeDt = Math.min(Math.max(dt, 0), 0.05);
    this._time += safeDt;

    copyCameraTransform(this.root, camera);
    copyCameraTransform(this.proxyRoot, camera);
    this.root.scale.setScalar(this._modelScale);
    this.proxyRoot.scale.setScalar(this._modelScale);

    const cameraPos = this.root.position;
    const cameraDelta = cameraPos.distanceTo(this._lastCameraPos);
    this._lastCameraPos.copy(cameraPos);
    this._cameraSpeed = THREE.MathUtils.lerp(this._cameraSpeed, cameraDelta / Math.max(safeDt, 0.001), 0.12);
    this._updateViewLag(safeDt);

    this._castKick *= Math.exp(-3.4 * safeDt);
    this._biteKick *= Math.exp(-5.4 * safeDt);
    this._hookSetKick *= Math.exp(-3.2 * safeDt);
    this._successKick *= Math.exp(-3.0 * safeDt);
    this._failKick *= Math.exp(-3.0 * safeDt);
    this._lineCast *= Math.exp(-1.2 * safeDt);
    this._castCharge = THREE.MathUtils.lerp(this._castCharge, 0, 1 - Math.exp(-1.1 * safeDt));
    this._fightTension = THREE.MathUtils.lerp(this._fightTension, 0, 1 - Math.exp(-0.85 * safeDt));
    if (this._reeling) this._reelPhase += safeDt * 16.0;

    const moveAmp = moving ? 1.0 : 0.35;
    const handBob = Math.sin(this._time * 8.2) * 0.012 * moveAmp;
    const handSway = Math.sin(this._time * 5.1) * 0.009 * moveAmp;
    const inertialSag = Math.min(this._cameraSpeed * 0.018, 0.04);
    const reelPulse = this._reeling ? Math.sin(this._reelPhase) : 0;
    const bitePulse = Math.sin(this._time * 42.0) * this._biteKick;

    const butt = this._baseButt.clone();
    butt.x += handSway * 0.5 + this._castCharge * 0.055 - this._castKick * 0.085 + this._hookSetKick * 0.070;
    butt.y += handBob - this._castCharge * 0.080 + this._castKick * 0.060 + this._hookSetKick * 0.130;
    butt.z += this._castCharge * 0.150 + this._hookSetKick * 0.190 - this._castKick * 0.040;

    const grip = this._baseGrip.clone();
    grip.x += handSway * 0.35 + this._castCharge * 0.045 - this._castKick * 0.065 + this._hookSetKick * 0.050;
    grip.y += handBob * 0.6 - this._castCharge * 0.065 + this._castKick * 0.075 + this._hookSetKick * 0.110;
    grip.z += this._castCharge * 0.130 + this._hookSetKick * 0.170 - this._castKick * 0.030;

    this._tipLocal.copy(this._baseTip);
    this._tipLocal.x += Math.sin(this._time * 4.7) * 0.012 * moveAmp;
    this._tipLocal.y += Math.sin(this._time * 7.6) * 0.010 * moveAmp - inertialSag;
    this._tipLocal.x += this._viewLag.x * 0.55 + reelPulse * 0.024;
    this._tipLocal.y += this._viewLag.y * 0.45 - this._castCharge * 0.180 + this._castKick * 0.330 + this._hookSetKick * 0.420 - this._fightTension * 0.210 + bitePulse * 0.040;
    this._tipLocal.z += this._castCharge * 0.360 - this._castKick * 0.620 + this._hookSetKick * 0.460 + this._successKick * 0.250 - this._failKick * 0.180;

    const hookTarget = this._baseHook.clone();
    hookTarget.x += Math.sin(this._time * 2.4) * 0.035 + handSway * 1.4;
    hookTarget.y += Math.sin(this._time * 3.3) * 0.018 - inertialSag * 1.5;
    hookTarget.z += Math.sin(this._time * 1.8) * 0.025;
    hookTarget.addScaledVector(this._viewLag, 1.65);
    hookTarget.x += reelPulse * 0.040 + this._biteKick * Math.sin(this._time * 38.0) * 0.110;
    hookTarget.y += this._lineCast * 0.280 - this._fightTension * 0.150 + this._hookSetKick * 0.280 + this._successKick * 0.300 - this._failKick * 0.220;
    hookTarget.z += -this._lineCast * 0.700 + this._hookSetKick * 0.560 + this._successKick * 0.680 - this._failKick * 0.320 + (this._reeling ? 0.150 : 0.0);

    const spring = this._lineCast > 0.25 || this._fightTension > 0.2 ? 48.0 : 36.0;
    TEMP_DIR.subVectors(hookTarget, this._hookLocal).multiplyScalar(spring * safeDt);
    this._hookVelocity.add(TEMP_DIR);
    this._hookVelocity.multiplyScalar(Math.exp(-(this._fightTension > 0.2 ? 6.2 : 7.2) * safeDt));
    this._hookLocal.addScaledVector(this._hookVelocity, safeDt);

    alignCylinder(this._grip, butt, grip);
    alignCylinder(this._shaft, grip, this._tipLocal);
    this._tip.position.copy(this._tipLocal);
    this._hookGroup.position.copy(this._hookLocal);
    this._hookGroup.rotation.set(0.12, Math.sin(this._time * 2.0) * 0.18, Math.sin(this._time * 3.0) * 0.28);
    this._handGroup.position.copy(butt).add(this._handOffset);
    this._handGroup.rotation.set(-0.16, 0.2, -0.52);

    this._wraps.forEach(({ t, mesh }, i) => {
      mesh.position.lerpVectors(grip, this._tipLocal, t);
      mesh.quaternion.copy(this._shaft.quaternion);
      mesh.rotateX(Math.PI / 2);
      mesh.scale.setScalar(1.0 - i * 0.08);
    });

    this._updateLinePoints(this._tipLocal, this._hookLocal, moving);
    this._updateProxyMeshes(butt, grip);
  }

  _updateViewLag(dt) {
    if (!this._cameraQuatReady) {
      this._lastCameraQuat.copy(this.root.quaternion);
      this._cameraQuatReady = true;
      return;
    }

    TEMP_QUAT.copy(this._lastCameraQuat).invert().multiply(this.root.quaternion);
    TEMP_EULER.setFromQuaternion(TEMP_QUAT, 'YXZ');
    this._lastCameraQuat.copy(this.root.quaternion);

    const invDt = 1 / Math.max(dt, 0.001);
    const yawVel = THREE.MathUtils.clamp(TEMP_EULER.y * invDt, -8.0, 8.0);
    const pitchVel = THREE.MathUtils.clamp(TEMP_EULER.x * invDt, -8.0, 8.0);
    const targetX = THREE.MathUtils.clamp(yawVel * 0.070, -0.36, 0.36);
    const targetY = THREE.MathUtils.clamp(-pitchVel * 0.052, -0.28, 0.28);
    const a = 1 - Math.exp(-11.0 * dt);
    this._viewLag.x += (targetX - this._viewLag.x) * a;
    this._viewLag.y += (targetY - this._viewLag.y) * a;
    this._viewLag.z = 0;

    this._hookVelocity.x += (targetX - this._viewLag.x) * 8.0 * dt;
    this._hookVelocity.y += (targetY - this._viewLag.y) * 6.0 * dt;
  }

  _updateLinePoints(from, to, moving) {
    const tensionSag = this._fightTension * 0.065 + this._hookSetKick * 0.055;
    const castSag = this._lineCast * 0.08;
    const sag = Math.max(
      0.035,
      0.09 + (moving ? 0.035 : 0.018) + Math.min(this._cameraSpeed * 0.012, 0.05) + castSag - tensionSag,
    );
    for (let i = 0; i < this._linePoints.length; i++) {
      const t = i / (this._linePoints.length - 1);
      const p = this._linePoints[i];
      p.lerpVectors(from, to, t);
      p.y -= Math.sin(Math.PI * t) * sag;
      const wave = Math.sin(Math.PI * t);
      p.x += Math.sin(this._time * 4.0 + t * 5.0) * (0.006 + this._biteKick * 0.014) * wave;
      p.z += Math.cos(this._time * 3.3 + t * 3.0) * (0.004 + this._lineCast * 0.018) * wave;
      this._linePositions[i * 3 + 0] = p.x;
      this._linePositions[i * 3 + 1] = p.y;
      this._linePositions[i * 3 + 2] = p.z;
    }
    this._lineGeometry.attributes.position.needsUpdate = true;
    this._lineGeometry.computeBoundingSphere();
  }

  _updateProxyMeshes(butt, grip) {
    alignCylinder(this._proxyGrip, butt, grip);
    alignCylinder(this._proxyShaft, grip, this._tipLocal);
    this._proxyTip.position.copy(this._tipLocal);
    this._proxyHook.position.copy(this._hookLocal);
    this._proxyHand.position.copy(this._handGroup.position);
    this._proxyHand.quaternion.copy(this._handGroup.quaternion);
    for (let i = 0; i < this._proxyLineSegments.length; i++) {
      alignCylinder(this._proxyLineSegments[i], this._linePoints[i], this._linePoints[i + 1]);
    }
  }

  dispose() {
    this.root.removeFromParent();
    this.proxyRoot.removeFromParent();
    this.root.traverse((obj) => {
      obj.geometry?.dispose?.();
    });
    this.proxyRoot.traverse((obj) => {
      obj.geometry?.dispose?.();
    });
    Object.values(this._materials).forEach((material) => material.dispose());
    this._proxyMaterial.dispose();
  }
}
