import * as THREE from 'three';
import type { Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

export interface LayoutOptions {
  /** Grosor de la extrusión, en alturas de mayúscula. */
  depth: number;
  /** Bisel: lo que redondea el canto. Generoso = letra orgánica. */
  bevel: number;
  /** Separación entre letras. Negativo = se tocan o se solapan. */
  tracking: number;
  /** Altura del arco de cada línea, en anchos de línea. Positivo = sonrisa. */
  arc: number;
  /** Cuánto se adelantan las letras centrales respecto a las de los extremos. */
  arcDepth: number;
  /**
   * Separación vertical entre líneas, como fracción de la altura media de las
   * dos. 1 = las mayúsculas se tocan justo; por debajo se solapan y se pisan;
   * por encima aparece aire. Para un hero apretado, entre 1.0 y 1.08.
   */
  leading: number;
}

export interface Letter {
  char: string;
  geometry: THREE.BufferGeometry;
  /** Posición y giro de reposo. La animación parte siempre de aquí. */
  base: THREE.Vector3;
  baseRotation: THREE.Euler;
  /** Escala de la línea a la que pertenece. */
  scale: number;
  line: number;
  /** 0 a 1 de izquierda a derecha: sirve para escalonar la animación. */
  t: number;
}

export interface Layout {
  letters: Letter[];
  width: number;
  height: number;
  /** Z máxima del bloque: lo que más se acerca a la cámara. */
  front: number;
}

/**
 * Coloca las letras una a una en dos líneas curvadas y del mismo ancho.
 *
 * Las dos líneas se escalan por separado hasta medir lo mismo: "PAKO" tiene
 * cuatro letras y "PORTALO" siete, así que PAKO acaba bastante más grande.
 * Es un recurso editorial clásico y llena el marco en vez de dejar aire.
 */
export function layoutLines(
  lines: readonly string[],
  font: Font,
  options: LayoutOptions,
): Layout {
  const { depth, bevel, tracking, arc, arcDepth, leading } = options;

  // Una geometría por carácter, reutilizada si el carácter se repite.
  const cache = new Map<string, { geometry: THREE.BufferGeometry; width: number }>();

  function glyph(char: string) {
    const cached = cache.get(char);
    if (cached) return cached;

    const geometry = new TextGeometry(char, {
      font,
      size: 1,
      depth,
      curveSegments: 14,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelOffset: 0,
      bevelSegments: 6,
    });

    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const width = box.max.x - box.min.x;

    // Centrado en X y en Z; la Y se deja en la línea base tipográfica.
    geometry.translate(-(box.min.x + box.max.x) / 2, 0, -depth / 2);

    const entry = { geometry, width };
    cache.set(char, entry);
    return entry;
  }

  // Ancho bruto de cada línea con el tracking pedido.
  const measured = lines.map((line) => {
    const chars = [...line];
    const widths = chars.map((char) => glyph(char).width);
    const raw =
      widths.reduce((sum, width) => sum + width, 0) + tracking * (chars.length - 1);
    return { chars, widths, raw };
  });

  // Todas las líneas al ancho de la más ancha: quedan justificadas.
  const target = Math.max(...measured.map((line) => line.raw));
  const lineScales = measured.map(({ raw }) => target / raw);

  // Altura de mayúscula en unidades de fuente, común a todas las líneas.
  let capHeight = 0;
  for (const { chars } of measured) {
    for (const char of chars) {
      const { geometry } = glyph(char);
      geometry.computeBoundingBox();
      capHeight = Math.max(capHeight, geometry.boundingBox!.max.y);
    }
  }

  // Cada línea mide distinto de alto porque cada una lleva su escala. Se apilan
  // de arriba abajo acumulando alturas reales, no un paso fijo: si no, el
  // interlineado se descuadra en cuanto las escalas difieren.
  const lineHeights = lineScales.map((scale) => capHeight * scale);
  const gaps = lineHeights.slice(0, -1).map((height, index) => {
    return ((height + lineHeights[index + 1]!) / 2) * leading;
  });
  const blockSpan = lineHeights[0]! / 2 + gaps.reduce((a, b) => a + b, 0) + lineHeights.at(-1)! / 2;

  const baselines: number[] = [];
  let cursorY = blockSpan / 2 - lineHeights[0]! / 2;
  lineHeights.forEach((height, index) => {
    // La línea base queda medio alto por debajo del centro de la línea.
    baselines.push(cursorY - height / 2);
    if (index < gaps.length) cursorY -= gaps[index]!;
  });

  const letters: Letter[] = [];

  measured.forEach(({ chars, raw }, lineIndex) => {
    const scale = lineScales[lineIndex]!;
    const baseline = baselines[lineIndex]!;
    // Se coloca en el ancho NATURAL de la línea y se escala después. Colocar
    // ya en el ancho objetivo y volver a escalar multiplicaría dos veces.
    const halfRaw = raw / 2;

    let cursor = -halfRaw;

    chars.forEach((char, charIndex) => {
      const { width } = glyph(char);
      const centre = cursor + width / 2;
      cursor += width + tracking;

      // Parábola: 0 en los extremos de la línea, máximo en el centro.
      const normalised = halfRaw === 0 ? 0 : centre / halfRaw;
      const lift = arc * target * (1 - normalised * normalised);
      const forward = arcDepth * target * (1 - normalised * normalised);
      const slope = halfRaw === 0 ? 0 : (arc * target * -2 * normalised) / halfRaw;

      letters.push({
        char,
        geometry: glyph(char).geometry,
        base: new THREE.Vector3(centre * scale, baseline + lift, forward),
        baseRotation: new THREE.Euler(0, 0, Math.atan(slope)),
        scale,
        line: lineIndex,
        t: chars.length === 1 ? 0.5 : charIndex / (chars.length - 1),
      });
    });
  });

  // Caja real del conjunto, ya con escalas, arcos y profundidad aplicados.
  const box = new THREE.Box3();
  const corner = new THREE.Box3();

  letters.forEach((letter, index) => {
    letter.geometry.computeBoundingBox();
    corner.copy(letter.geometry.boundingBox!);
    corner.min.multiplyScalar(letter.scale).add(letter.base);
    corner.max.multiplyScalar(letter.scale).add(letter.base);
    if (index === 0) box.copy(corner);
    else box.union(corner);
  });

  return {
    letters,
    width: box.max.x - box.min.x,
    height: box.max.y - box.min.y,
    front: box.max.z,
  };
}
