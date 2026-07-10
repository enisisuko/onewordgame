import * as THREE from 'three';

function createProxyMaterial() {
  return new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    colorWrite: false,
    depthWrite: true,
    depthTest: true,
  });
}

function addBox(root, material, name, size, position, rotation = [0, 0, 0]) {
  const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(position[0], position[1], position[2]);
  mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  root.add(mesh);
  return mesh;
}

function addPlane(root, material, name, size, position, rotation = [-Math.PI / 2, 0, 0]) {
  const geometry = new THREE.PlaneGeometry(size[0], size[1]);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(position[0], position[1], position[2]);
  mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  root.add(mesh);
  return mesh;
}

function addPosts(root, material, prefix, positions, height = 0.85) {
  positions.forEach((pos, i) => {
    addBox(root, material, `${prefix}-${i + 1}`, [0.12, height, 0.12], [pos[0], height * 0.5, pos[1]]);
  });
}

function addMarkerProxy(root, material, marker) {
  const position = marker.position ?? [0, 0, 0];
  const prefix = `dof-proxy-marker-${marker.id ?? root.children.length}`;

  const coneGeo = new THREE.ConeGeometry(0.24, 0.58, 8);
  const cone = new THREE.Mesh(coneGeo, material);
  cone.name = `${prefix}-cone`;
  cone.position.set(position[0], position[1] + 0.55, position[2]);
  cone.rotation.x = Math.PI;
  root.add(cone);

  const ringGeo = new THREE.RingGeometry(0.34, 0.58, 24);
  const ring = new THREE.Mesh(ringGeo, material);
  ring.name = `${prefix}-ring`;
  ring.position.set(position[0], position[1] + 0.05, position[2]);
  ring.rotation.x = -Math.PI / 2;
  root.add(ring);
}

function buildDofProxyRoot(name, material, markers = []) {
  const root = new THREE.Group();
  root.name = name;
  root.userData.proxyMaterial = material;

  addPlane(root, material, 'dof-proxy-ground', [15, 15], [0, 0, 0]);
  addPlane(root, material, 'dof-proxy-water', [8, 5.5], [1.2, 0.025, -2.2]);

  addBox(root, material, 'dof-proxy-fishing-platform', [2.7, 0.18, 2.1], [0, 0.18, 1.1], [0, 0.05, 0]);
  addBox(root, material, 'dof-proxy-dock-main', [4.4, 0.18, 1.35], [-1.9, 0.2, -0.45], [0, 0.12, 0]);
  addBox(root, material, 'dof-proxy-dock-extension', [1.05, 0.16, 3.1], [-2.75, 0.22, 0.5], [0, -0.08, 0]);

  addBox(root, material, 'dof-proxy-shore-bank', [3.2, 0.42, 1.45], [2.35, 0.22, -1.75], [0, -0.22, 0]);
  addBox(root, material, 'dof-proxy-left-rock', [1.35, 0.75, 0.9], [-2.95, 0.38, -2.0], [0.08, 0.45, -0.08]);
  addBox(root, material, 'dof-proxy-back-rock', [4.2, 1.1, 0.38], [0, 0.55, -2.45], [0, -0.08, 0]);

  addBox(root, material, 'dof-proxy-front-rail', [3.8, 0.55, 0.08], [-1.35, 0.65, 0.88], [0, 0.08, 0]);
  addBox(root, material, 'dof-proxy-back-rail', [4.2, 0.7, 0.08], [-0.3, 0.74, -1.55], [0, -0.05, 0]);
  addPosts(root, material, 'dof-proxy-rail-post', [
    [-3.2, 0.9],
    [-2.2, 0.95],
    [-1.1, 0.95],
    [0.2, 0.88],
    [-3.4, -1.25],
    [-2.1, -1.45],
    [-0.6, -1.55],
    [0.8, -1.45],
  ]);

  markers.forEach((marker) => addMarkerProxy(root, material, marker));

  root.userData.dispose = () => {
    root.traverse((obj) => {
      if (obj.isMesh) obj.geometry?.dispose();
    });
    material.dispose();
  };

  return root;
}

export function createDofProxyRoot(markers = []) {
  return buildDofProxyRoot('DofProxyRoot', createProxyMaterial(), markers);
}
