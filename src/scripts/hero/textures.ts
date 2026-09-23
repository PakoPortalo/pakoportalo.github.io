import * as THREE from 'three';

/** Paradas de la rampa termográfica, de frío a calor. */
const THERMAL: Array<[number, string]> = [
  [0, '#050a2e'],
  [0.16, '#0b2fa0'],
  [0.34, '#0c9fb5'],
  [0.5, '#2fc84a'],
  [0.64, '#e6e030'],
  [0.79, '#f2820f'],
  [0.91, '#dc1d24'],
  [1, '#fff4d6'],
];

function applyStops(
  gradient: CanvasGradient,
  stops: Array<[number, string]>,
): CanvasGradient {
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  return gradient;
}

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return [canvas, canvas.getContext('2d')!];
}

function toTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Matcap termográfico.
 *
 * Un matcap asigna color según hacia dónde mira la superficie respecto a la
 * cámara: el centro de la textura son las caras de frente y el borde las de
 * canto. Poniendo el blanco incandescente en el centro y el azul en el borde,
 * las letras parecen emitir calor por las caras que dan al espectador, y se
 * enfrían por los cantos. Sale gratis: ni luces, ni shaders propios.
 */
export function thermalMatcap(size = 512): THREE.CanvasTexture {
  const [canvas, context] = makeCanvas(size);

  // Fondo del color más frío: cubre las esquinas fuera del disco.
  context.fillStyle = THERMAL[0]![1];
  context.fillRect(0, 0, size, size);

  // El foco caliente va ligeramente arriba a la izquierda: sugiere una
  // dirección de luz y evita que las letras se vean planas y simétricas.
  const centreX = size * 0.42;
  const centreY = size * 0.38;

  const gradient = context.createRadialGradient(
    centreX,
    centreY,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  // La rampa se recorre al revés: dentro caliente, fuera frío.
  applyStops(
    gradient,
    THERMAL.map(([offset, color]) => [1 - offset, color] as [number, string]).reverse(),
  );

  context.fillStyle = gradient;
  context.beginPath();
  context.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  context.fill();

  return toTexture(canvas);
}

/** Degradado radial para el fondo de escena. */
export function radialBackdrop(inner: string, outer: string): THREE.CanvasTexture {
  const [canvas, context] = makeCanvas(512);
  const gradient = context.createRadialGradient(256, 215, 0, 256, 215, 384);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 512);
  return toTexture(canvas);
}

/** Campo termográfico para el fondo: manchas de calor sobre frío. */
export function thermalField(blobs = 9): THREE.CanvasTexture {
  const size = 512;
  const [canvas, context] = makeCanvas(size);

  context.fillStyle = THERMAL[0]![1];
  context.fillRect(0, 0, size, size);

  // Posiciones deterministas: el hero debe verse igual en cada carga.
  for (let index = 0; index < blobs; index += 1) {
    const angle = index * 2.399; // ángulo áureo: reparte sin agrupar
    const radius = (0.18 + 0.32 * ((index * 7) % 5) / 4) * size;
    const x = size / 2 + Math.cos(angle) * radius;
    const y = size / 2 + Math.sin(angle) * radius;
    const spread = size * (0.16 + 0.12 * (((index * 3) % 4) / 3));

    const gradient = context.createRadialGradient(x, y, 0, x, y, spread);
    const heat = 0.45 + 0.55 * (((index * 5) % 7) / 6);
    applyStops(
      gradient,
      THERMAL.filter(([offset]) => offset <= heat)
        .map(([offset, color]) => [offset / heat, color] as [number, string])
        .reverse()
        .map(([offset, color]) => [1 - offset, color] as [number, string]),
    );

    context.globalCompositeOperation = 'lighter';
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, spread, 0, Math.PI * 2);
    context.fill();
  }

  context.globalCompositeOperation = 'source-over';
  return toTexture(canvas);
}

/**
 * Franjas verticales de ancho irregular, tipo código de barras.
 * Es el detalle que da el aire técnico e industrial al estilo Techno Geometry.
 */
export function barcodeTexture(
  ink: string,
  paper: string,
  bars = 26,
): THREE.CanvasTexture {
  const width = 256;
  const height = 64;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;

  context.fillStyle = paper;
  context.fillRect(0, 0, width, height);
  context.fillStyle = ink;

  let x = 0;
  for (let index = 0; index < bars && x < width; index += 1) {
    // Anchos que alternan sin ser regulares, como un código real.
    const bar = 2 + ((index * 5) % 4) * 2;
    const gap = 2 + ((index * 3) % 3) * 2;
    context.fillRect(x, 0, bar, height);
    x += bar + gap;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Retícula de líneas finas, para contener el caos cromático del Heat Map. */
export function gridTexture(
  line: string,
  cells = 8,
  thickness = 2,
): THREE.CanvasTexture {
  const size = 512;
  const [canvas, context] = makeCanvas(size);

  context.clearRect(0, 0, size, size);
  context.strokeStyle = line;
  context.lineWidth = thickness;

  const step = size / cells;
  for (let index = 0; index <= cells; index += 1) {
    const position = Math.round(index * step) + 0.5;
    context.beginPath();
    context.moveTo(position, 0);
    context.lineTo(position, size);
    context.moveTo(0, position);
    context.lineTo(size, position);
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Tira de etiquetas técnicas minúsculas: códigos, siglas, numeración.
 * Es el relleno que da densidad al estilo Zerk sin añadir geometría.
 */
export function labelStrip(
  labels: readonly string[],
  ink: string,
  paper: string,
): THREE.CanvasTexture {
  const width = 1024;
  const height = 64;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;

  context.fillStyle = paper;
  context.fillRect(0, 0, width, height);

  context.fillStyle = ink;
  context.font = '600 30px ui-monospace, monospace';
  context.textBaseline = 'middle';

  let x = 18;
  let index = 0;
  while (x < width) {
    const label = labels[index % labels.length]!;
    context.fillText(label, x, height / 2 + 1);
    x += context.measureText(label).width + 46;
    index += 1;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

/**
 * Ornamento de líneas: marcos redondeados y asteriscos, como los de las
 * fundiciones tipográficas. Aporta el aire editorial del estilo Gran Blue.
 */
export function ornamentTexture(line: string): THREE.CanvasTexture {
  const size = 1024;
  const [canvas, context] = makeCanvas(size);

  context.clearRect(0, 0, size, size);
  context.strokeStyle = line;
  context.lineWidth = 3;

  // Marcos con esquinas muy redondeadas, concéntricos.
  for (let index = 0; index < 4; index += 1) {
    const inset = 40 + index * 86;
    const radius = 90 - index * 12;
    context.beginPath();
    context.roundRect(inset, inset, size - inset * 2, size - inset * 2, radius);
    context.stroke();
  }

  // Asteriscos en las esquinas del marco exterior.
  context.lineWidth = 4;
  for (const [cx, cy] of [
    [110, 110],
    [size - 110, 110],
    [110, size - 110],
    [size - 110, size - 110],
  ] as const) {
    for (let arm = 0; arm < 6; arm += 1) {
      const angle = (arm / 6) * Math.PI * 2;
      context.beginPath();
      context.moveTo(cx, cy);
      context.lineTo(cx + Math.cos(angle) * 26, cy + Math.sin(angle) * 26);
      context.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
