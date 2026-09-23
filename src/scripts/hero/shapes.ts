import * as THREE from 'three';

/**
 * Esfera deformada con bultos: la base orgánica del estilo Avant Basic.
 * El `seed` cambia el relieve para que no se repitan dos bultos iguales.
 */
export function blobGeometry(seed: number, amount = 0.26): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(1, 4);
  const position = geometry.getAttribute('position');
  const vertex = new THREE.Vector3();

  const a = 1.7 + (seed % 5) * 0.42;
  const b = 2.3 + (seed % 3) * 0.55;
  const c = 1.1 + (seed % 7) * 0.3;

  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index).normalize();
    const lump =
      Math.sin(vertex.x * a + seed) *
        Math.cos(vertex.y * b - seed) *
        Math.sin(vertex.z * c + seed * 0.5);
    vertex.multiplyScalar(1 + amount * lump);
    position.setXYZ(index, vertex.x, vertex.y, vertex.z);
  }

  geometry.computeVertexNormals();
  return geometry;
}

/** Cápsula alargada y redondeada, tipo "gusano" hinchado. */
export function wormGeometry(): THREE.BufferGeometry {
  return new THREE.CapsuleGeometry(0.55, 1.5, 8, 24);
}

/** Toro grueso, casi un donut hinchado. */
export function ringGeometry(): THREE.BufferGeometry {
  return new THREE.TorusGeometry(0.85, 0.42, 20, 44);
}
