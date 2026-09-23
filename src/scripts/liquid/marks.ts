/**
 * Marcas gráficas del hero.
 *
 * Son vectores, no imágenes: se dibujan con código sobre el mismo lienzo que
 * el texto, así que escalan solas, pesan cero y —lo importante— el líquido
 * las refracta al pasar por encima igual que al título. Si fueran HTML se
 * quedarían planas y se notaría que están pegadas.
 *
 * Abajo hay un juego de piezas sueltas y, al final, cinco composiciones
 * hechas con ellas.
 */

/** Medidas del bloque de texto, para colgar las marcas de algo y no del aire. */
export interface MarkLayout {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  /** Margen lateral del bloque de texto. */
  margin: number;
  /** Ancho del título, que es el que manda sobre todo el bloque. */
  blockWidth: number;
  bigSize: number;
  eyebrowBaseline: number;
  titleBaseline: number;
  subtitleBaseline: number;
  /** Línea en la que acaba el bloque de texto. */
  blockBottom: number;
}

const WHITE = (alpha: number) => `rgba(255, 255, 255, ${alpha})`;

// --- Piezas -----------------------------------------------------------------

/**
 * Escalerilla de cruces.
 *
 * La cruz va de contorno, no maciza: el repertorio del que sale es todo
 * línea, y rellena pesa demasiado para una esquina que tiene que quedarse
 * callada. Son doce vértices, los de un signo más.
 */
export function crossStack(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  unit: number,
  cells: [number, number][],
) {
  const step = unit * 1.55;
  const arm = unit * 0.5;
  const thick = unit * 0.17;

  ctx.save();
  ctx.strokeStyle = WHITE(0.55);
  ctx.lineWidth = Math.max(unit * 0.055, 0.8);
  ctx.lineJoin = 'round';

  for (const [column, row] of cells) {
    const x = left + arm + column * step;
    const y = top + arm + row * step;
    ctx.beginPath();
    ctx.moveTo(x - thick, y - arm);
    ctx.lineTo(x + thick, y - arm);
    ctx.lineTo(x + thick, y - thick);
    ctx.lineTo(x + arm, y - thick);
    ctx.lineTo(x + arm, y + thick);
    ctx.lineTo(x + thick, y + thick);
    ctx.lineTo(x + thick, y + arm);
    ctx.lineTo(x - thick, y + arm);
    ctx.lineTo(x - thick, y + thick);
    ctx.lineTo(x - arm, y + thick);
    ctx.lineTo(x - arm, y - thick);
    ctx.lineTo(x - thick, y - thick);
    ctx.closePath();
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Diagrama de órbitas: dos vórtices de elipses en un marco con escuadras.
 *
 * La clave está en que cada elipse es un poco más pequeña que la anterior Y
 * está girada un poco más, con el centro corrido hacia el foco. Girando sin
 * encoger sale una roseta simétrica, que es otra cosa: un donut con un
 * agujero en medio. Encogiendo, las elipses se van metiendo unas dentro de
 * otras y lo que se dibuja es un remolino que cae al centro.
 */
export function orbitDiagram(
  ctx: CanvasRenderingContext2D,
  centreX: number,
  centreY: number,
  size: number,
) {
  const hair = Math.max(size * 0.0038, 0.55);
  const halfHeight = size * 0.34;

  ctx.save();

  // --- Marco: rectángulo fino, escuadras en las esquinas y caja punteada ---
  ctx.strokeStyle = WHITE(0.3);
  ctx.lineWidth = hair;
  ctx.beginPath();
  ctx.rect(centreX - size * 0.5, centreY - halfHeight, size, halfHeight * 2);
  ctx.stroke();

  ctx.setLineDash([size * 0.02, size * 0.02]);
  ctx.beginPath();
  ctx.rect(
    centreX - size * 0.44,
    centreY - halfHeight * 0.84,
    size * 0.88,
    halfHeight * 1.68,
  );
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(centreX - size * 0.44, centreY);
  ctx.lineTo(centreX + size * 0.44, centreY);
  ctx.stroke();
  ctx.setLineDash([]);

  cornerBrackets(
    ctx,
    centreX - size * 0.5,
    centreY - halfHeight,
    size,
    halfHeight * 2,
    size * 0.075,
  );

  // --- Los dos vórtices ---
  // El de la izquierda algo menor que el de la derecha: simétricos se leen
  // como unos prismáticos, desiguales se leen como un diagrama.
  const turns = 26;
  ctx.lineWidth = hair * 0.85;

  for (const [offsetX, lobe] of [
    [-size * 0.15, 0.82],
    [size * 0.13, 1.0],
  ] as [number, number][]) {
    const focusX = centreX + offsetX;
    const major = size * 0.235 * lobe;
    const minor = size * 0.115 * lobe;

    for (let index = 0; index < turns; index += 1) {
      const t = index / (turns - 1);
      // Metida y media: menos no llega a leerse como remolino, y más
      // amontona tantas elipses en el centro que se cierra en negro.
      const angle = t * Math.PI * 3;
      const shrink = 1 - 0.78 * t;
      ctx.strokeStyle = WHITE(0.34 - 0.1 * t);
      ctx.beginPath();
      ctx.ellipse(
        focusX + Math.cos(angle) * major * shrink * 0.72,
        centreY + Math.sin(angle) * minor * shrink * 0.72,
        major * shrink,
        minor * shrink,
        angle,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }

    // Punto en el corazón del remolino.
    ctx.fillStyle = WHITE(0.7);
    ctx.beginPath();
    ctx.arc(focusX, centreY, Math.max(size * 0.008, 1), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Caja de osciloscopio: una traza de audio dentro de un rectángulo fino.
 *
 * La onda es suma de cuatro senos con frecuencias que no son múltiplos entre
 * sí. Si lo fueran el dibujo se repetiría y se vería el patrón; así parece
 * una señal de verdad sin necesidad de guardar datos.
 */
export function waveBox(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  boxWidth: number,
  boxHeight: number,
  phase: number,
) {
  ctx.save();
  ctx.strokeStyle = WHITE(0.3);
  ctx.lineWidth = Math.max(boxWidth * 0.0028, 0.7);
  ctx.beginPath();
  ctx.roundRect(left, top, boxWidth, boxHeight, boxHeight * 0.12);
  ctx.stroke();

  const midY = top + boxHeight / 2;
  const steps = Math.max(Math.round(boxWidth / 2), 60);

  ctx.strokeStyle = WHITE(0.62);
  ctx.lineWidth = Math.max(boxWidth * 0.004, 1);
  ctx.lineJoin = 'round';
  ctx.beginPath();

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const x = left + boxWidth * 0.06 + t * boxWidth * 0.88;
    // El sobre sube y baja para que la traza no llegue plana a los bordes.
    const envelope = Math.sin(Math.PI * t) ** 0.6;
    const value =
      Math.sin((t * 11.0 + phase) * Math.PI) * 0.55 +
      Math.sin((t * 27.0 + phase * 1.7) * Math.PI) * 0.26 +
      Math.sin((t * 43.0 + phase * 0.4) * Math.PI) * 0.13 +
      Math.sin((t * 71.0 + phase * 2.3) * Math.PI) * 0.06;
    const y = midY - value * envelope * boxHeight * 0.38;
    if (step === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Rejilla de semitono: puntos que se van encogiendo hasta desaparecer.
 *
 * `angle` es hacia dónde se desvanece, en radianes. Es la pieza más barata de
 * todo el repertorio y la que mejor aguanta a tamaño pequeño: al no tener
 * líneas finas juntas, no vibra sobre el humo.
 */
export function halftoneFade(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  columns: number,
  rows: number,
  cell: number,
  angle: number,
) {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  // Cuánto mide la diagonal proyectada, para normalizar el desvanecido.
  const span = Math.abs(dirX) * (columns - 1) + Math.abs(dirY) * (rows - 1) || 1;

  ctx.save();
  ctx.fillStyle = WHITE(0.5);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const projected =
        (dirX > 0 ? column : columns - 1 - column) * Math.abs(dirX) +
        (dirY > 0 ? row : rows - 1 - row) * Math.abs(dirY);
      const fade = 1 - projected / span;
      if (fade <= 0.02) continue;
      ctx.beginPath();
      ctx.arc(
        left + column * cell + cell / 2,
        top + row * cell + cell / 2,
        cell * 0.36 * fade,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * Esfera de alambre.
 *
 * Los meridianos son elipses de semieje menor decreciente, que es lo que hace
 * la proyección de una esfera; los paralelos son cuerdas horizontales a la
 * altura que les toca. Dibujarlos como circunferencias completas sería más
 * corto pero se leería como una diana.
 */
export function wireSphere(
  ctx: CanvasRenderingContext2D,
  centreX: number,
  centreY: number,
  radius: number,
  meridians: number,
  parallels: number,
) {
  ctx.save();
  ctx.strokeStyle = WHITE(0.22);
  ctx.lineWidth = Math.max(radius * 0.004, 0.6);

  ctx.beginPath();
  ctx.arc(centreX, centreY, radius, 0, Math.PI * 2);
  ctx.stroke();

  for (let index = 1; index < meridians; index += 1) {
    const semiMinor = radius * Math.abs(Math.cos((index * Math.PI) / meridians));
    ctx.beginPath();
    ctx.ellipse(centreX, centreY, semiMinor, radius, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  for (let index = 1; index < parallels; index += 1) {
    const y = centreY - radius + (index * 2 * radius) / parallels;
    const halfChord = Math.sqrt(Math.max(radius * radius - (y - centreY) ** 2, 0));
    ctx.beginPath();
    ctx.moveTo(centreX - halfChord, y);
    ctx.lineTo(centreX + halfChord, y);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Marca de registro: anillos concéntricos con la cruz saliéndose por fuera.
 * La de toda la vida de las artes gráficas.
 */
export function registration(
  ctx: CanvasRenderingContext2D,
  centreX: number,
  centreY: number,
  radius: number,
) {
  ctx.save();
  ctx.strokeStyle = WHITE(0.5);
  ctx.lineWidth = Math.max(radius * 0.035, 0.7);

  for (const scale of [1, 0.62, 0.26]) {
    ctx.beginPath();
    ctx.arc(centreX, centreY, radius * scale, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.moveTo(centreX - radius * 1.35, centreY);
  ctx.lineTo(centreX + radius * 1.35, centreY);
  ctx.moveTo(centreX, centreY - radius * 1.35);
  ctx.lineTo(centreX, centreY + radius * 1.35);
  ctx.stroke();
  ctx.restore();
}

/** Marcas de corte: las cuatro escuadras que encajan un bloque. */
export function cornerBrackets(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  boxWidth: number,
  boxHeight: number,
  arm: number,
) {
  const right = left + boxWidth;
  const bottom = top + boxHeight;

  ctx.save();
  ctx.strokeStyle = WHITE(0.42);
  ctx.lineWidth = Math.max(arm * 0.05, 0.8);
  ctx.beginPath();
  // Cada esquina son dos segmentos que no llegan a tocarse.
  ctx.moveTo(left, top + arm); ctx.lineTo(left, top); ctx.lineTo(left + arm, top);
  ctx.moveTo(right - arm, top); ctx.lineTo(right, top); ctx.lineTo(right, top + arm);
  ctx.moveTo(right, bottom - arm); ctx.lineTo(right, bottom); ctx.lineTo(right - arm, bottom);
  ctx.moveTo(left + arm, bottom); ctx.lineTo(left, bottom); ctx.lineTo(left, bottom - arm);
  ctx.stroke();
  ctx.restore();
}

/** Regleta de marcas, una de cada cinco más larga. */
export function tickRuler(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  length: number,
  step: number,
  vertical: boolean,
  /** Hacia qué lado crecen las marcas. -1 para pegarla al borde derecho. */
  side = 1,
) {
  const count = Math.floor(length / step);

  ctx.save();
  ctx.strokeStyle = WHITE(0.34);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let index = 0; index <= count; index += 1) {
    const size = index % 5 === 0 ? step * 1.1 : step * 0.45;
    const offset = index * step;
    if (vertical) {
      ctx.moveTo(x, y + offset);
      ctx.lineTo(x + size * side, y + offset);
    } else {
      ctx.moveTo(x + offset, y);
      ctx.lineTo(x + offset, y + size);
    }
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Abanico de puntos: arcos concéntricos de puntos que se apagan hacia fuera.
 * Los puntos se reparten por longitud de arco, no por ángulo, para que la
 * densidad no se dispare en los radios cortos.
 */
export function dotFan(
  ctx: CanvasRenderingContext2D,
  centreX: number,
  centreY: number,
  innerRadius: number,
  outerRadius: number,
  fromAngle: number,
  toAngle: number,
  arcs: number,
) {
  ctx.save();
  ctx.fillStyle = WHITE(0.45);

  for (let arc = 0; arc < arcs; arc += 1) {
    const t = arc / (arcs - 1);
    const radius = innerRadius + (outerRadius - innerRadius) * t;
    const sweep = Math.abs(toAngle - fromAngle);
    const spacing = (outerRadius - innerRadius) / arcs;
    const count = Math.max(Math.round((radius * sweep) / spacing), 2);
    const fade = 1 - t;

    for (let index = 0; index <= count; index += 1) {
      const angle = fromAngle + (index / count) * (toAngle - fromAngle);
      ctx.beginPath();
      ctx.arc(
        centreX + Math.cos(angle) * radius,
        centreY + Math.sin(angle) * radius,
        spacing * 0.3 * (0.25 + fade * 0.75),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Disco de anillos concéntricos muy juntos. */
export function concentricRings(
  ctx: CanvasRenderingContext2D,
  centreX: number,
  centreY: number,
  radius: number,
  count: number,
) {
  ctx.save();
  ctx.strokeStyle = WHITE(0.3);
  ctx.lineWidth = Math.max(radius * 0.008, 0.6);
  for (let index = 1; index <= count; index += 1) {
    ctx.beginPath();
    ctx.arc(centreX, centreY, (radius * index) / count, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

// --- Composiciones ----------------------------------------------------------

export interface MarkPreset {
  name: string;
  draw(layout: MarkLayout): void;
}

/** Dónde empieza el aire de arriba, sin llegar a la fila de etiquetas. */
function topBand(layout: MarkLayout, blockHeight: number) {
  return Math.min(
    layout.height * 0.13,
    layout.eyebrowBaseline - layout.bigSize * 0.85 - blockHeight,
  );
}

export const MARK_PRESETS: MarkPreset[] = [
  {
    name: 'Sin marcas',
    draw() {},
  },
  {
    name: '1 · Instrumento',
    draw({ ctx, width, height, margin, blockBottom, eyebrowBaseline, bigSize }) {
      const unit = Math.min(Math.max(width * 0.019, 13), 30);
      const top = topBand({ width, height, margin, blockBottom, eyebrowBaseline, bigSize } as MarkLayout, unit * 5.65);
      if (top > margin * 0.4) {
        crossStack(ctx, margin, top, unit, [[0, 0], [0, 1], [0, 2], [1, 2], [0, 3], [1, 3]]);
      }
      const size = Math.min(Math.max(width * 0.155, 150), 260);
      orbitDiagram(ctx, width - margin - size * 0.5, blockBottom - size * 0.33, size);
    },
  },
  {
    name: '2 · Señal',
    draw({ ctx, width, height, margin, blockBottom, eyebrowBaseline, bigSize }) {
      const boxWidth = Math.min(Math.max(width * 0.26, 220), 420);
      const boxHeight = boxWidth * 0.3;
      const top = Math.min(height * 0.14, eyebrowBaseline - bigSize * 2.2);
      waveBox(ctx, width - margin - boxWidth, top, boxWidth, boxHeight, 0.37);

      const cell = Math.max(width * 0.0062, 6);
      halftoneFade(ctx, width - margin - cell * 14, top + boxHeight + cell * 2.2, 14, 6, cell, 0);

      const unit = Math.min(Math.max(width * 0.016, 11), 24);
      crossStack(ctx, margin, topBand({ height, eyebrowBaseline, bigSize } as MarkLayout, unit * 4.1), unit, [
        [0, 0], [0, 1], [1, 1],
      ]);

      const rings = Math.min(Math.max(width * 0.028, 26), 46);
      concentricRings(ctx, width - margin - rings, blockBottom - rings, rings, 9);
    },
  },
  {
    name: '3 · Retícula',
    draw({ ctx, width, height, margin, blockWidth, bigSize, eyebrowBaseline, blockBottom }) {
      const arm = Math.max(bigSize * 0.15, 15);
      const pad = bigSize * 0.26;
      const top = eyebrowBaseline - bigSize * 0.78;
      cornerBrackets(
        ctx,
        margin - pad,
        top - pad,
        blockWidth + pad * 2,
        blockBottom - top + pad * 1.6,
        arm,
      );

      const radius = Math.min(Math.max(width * 0.019, 16), 30);
      const markY = height * 0.13 + radius;
      registration(ctx, width - margin - radius * 1.4, markY, radius);

      // La regleta cuelga de la marca de registro y corre hacia el título, en
      // vez de arrancar suelta en una esquina.
      const step = Math.max(height * 0.015, 9);
      tickRuler(
        ctx,
        width - margin - step * 1.1,
        markY + radius * 2.4,
        Math.min(height * 0.22, top - markY - radius * 3),
        step,
        true,
        -1,
      );
    },
  },
  {
    name: '4 · Esfera',
    draw({ ctx, width, height, margin, blockBottom, eyebrowBaseline, bigSize }) {
      const radius = Math.min(height * 0.3, width * 0.22);
      wireSphere(ctx, width * 0.68, height * 0.36, radius, 9, 9);

      const cell = Math.max(width * 0.0055, 5);
      halftoneFade(ctx, margin, topBand({ height, eyebrowBaseline, bigSize } as MarkLayout, cell * 10), 10, 10, cell, Math.PI / 2);

      const size = Math.min(Math.max(width * 0.12, 120), 200);
      orbitDiagram(ctx, width - margin - size * 0.5, blockBottom - size * 0.33, size);
    },
  },
  {
    name: '5 · Semitono',
    draw({ ctx, width, height, margin, blockBottom, eyebrowBaseline, bigSize }) {
      const cell = Math.max(width * 0.007, 6);
      const top = topBand({ height, eyebrowBaseline, bigSize } as MarkLayout, cell * 8);

      halftoneFade(ctx, margin, top, 18, 8, cell, 0);

      const rings = Math.min(Math.max(width * 0.03, 28), 52);
      concentricRings(ctx, width - margin - rings, blockBottom - rings, rings, 11);
    },
  },
];
