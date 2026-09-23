/**
 * Comprueba que las fuentes de src/assets/ generan geometría 3D válida.
 * No necesita navegador: construir la geometría no usa WebGL.
 *
 *   node scripts/check-hero-font.mjs
 *
 * Ejecutar tras regenerar con scripts/font-to-typeface.py.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

const files = readdirSync('src/assets').filter((f) => f.endsWith('.json')).sort();
let failed = false;

for (const file of files) {
  const json = JSON.parse(readFileSync(`src/assets/${file}`, 'utf8'));
  const font = new FontLoader().parse(json);
  console.log(`\n${file}  (${json.familyName}, ${json.resolution} upem)`);

  for (const letter of ['P', 'O']) {
    const geometry = new TextGeometry(letter, {
      font,
      size: 1,
      depth: 0.3,
      curveSegments: 12,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.06,
      bevelSegments: 6,
    });
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    const vertices = geometry.getAttribute('position').count;
    const width = box.max.x - box.min.x;
    const height = box.max.y - box.min.y;

    console.log(
      `  ${letter}  vértices=${String(vertices).padStart(6)}  ` +
        `${width.toFixed(3)} x ${height.toFixed(3)}`,
    );

    if (vertices === 0 || !Number.isFinite(width)) {
      console.log(`  ✗ ${file} ${letter}: geometría inválida`);
      failed = true;
    }
    // Un bisel demasiado grande para el trazo colapsa la letra sobre sí misma.
    if (height < 0.4) {
      console.log(`  ✗ ${file} ${letter}: altura sospechosa (${height.toFixed(3)})`);
      failed = true;
    }
  }
}

console.log(failed ? '\nFALLOS' : '\nOK — todas las fuentes generan geometría válida');
process.exit(failed ? 1 : 0);
