import { curl } from './noise';
import type { HeroCopy, HeroFont, HeroFonts } from './fonts';
import { LIQUID, SMOKE, VERTEX } from './shaders';

const MAX_BLOBS = 24;
/** Gotas encadenadas que siguen al cursor; el resto viven por su cuenta. */
const STREAM = 6;
/** El humo es de frecuencia baja: a media resolución no se aprecia. */
const SMOKE_SCALE = 0.5;
/**
 * Tope de densidad de píxel. El bucle del shader recorre 24 gotas por píxel,
 * así que a dpr 3 en un monitor grande se dispara. A 1.75 no se nota y va
 * al doble de rápido.
 */
const MAX_DPR = 1.75;

export interface LiquidOptions {
  copy: HeroCopy;
  fonts: HeroFonts;
  reducedMotion: boolean;
  /**
   * Apaga el líquido y deja solo humo y texto. Sirve para juzgar la
   * maquetación: con el líquido encima no se puede leer nada.
   */
  plain?: boolean;
}

export interface LiquidHandle {
  destroy(): void;
}

interface Blob {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  weight: number;
  /** Desfase propio en el campo de ruido: cada gota ve una turbulencia distinta. */
  seed: number;
  /** Cuánto le afecta el campo turbulento. Las grandes son más perezosas. */
  drag: number;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Error al compilar el shader: ${log}`);
  }
  return shader;
}

function link(gl: WebGL2RenderingContext, vertex: string, fragment: string) {
  const program = gl.createProgram()!;
  const vs = compile(gl, gl.VERTEX_SHADER, vertex);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Error al enlazar el programa: ${log}`);
  }
  return program;
}

function uniforms(gl: WebGL2RenderingContext, program: WebGLProgram) {
  const map = new Map<string, WebGLUniformLocation | null>();
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let index = 0; index < count; index += 1) {
    const info = gl.getActiveUniform(program, index);
    if (!info) continue;
    const name = info.name.replace(/\[0\]$/, '');
    map.set(name, gl.getUniformLocation(program, info.name));
  }
  return map;
}

export async function createLiquidHero(
  canvas: HTMLCanvasElement,
  options: LiquidOptions,
): Promise<LiquidHandle> {
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
  });
  if (!gl) throw new Error('WebGL2 no disponible');

  // La tipografía tiene que estar cargada ANTES de pintar el texto en el
  // canvas 2D: si no, se dibuja con la de respaldo y se queda así.
  await Promise.all(Object.values(options.fonts).map(loadFont));

  const smokeProgram = link(gl, VERTEX, SMOKE);
  const liquidProgram = link(gl, VERTEX, LIQUID);
  const smokeUniforms = uniforms(gl, smokeProgram);
  const liquidUniforms = uniforms(gl, liquidProgram);

  // El triángulo a pantalla completa se genera en el vértice a partir de
  // gl_VertexID, así que no hace falta ningún búfer de geometría.
  const vao = gl.createVertexArray();

  // --- Textura del humo ------------------------------------------------------

  const smokeTexture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, smokeTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const smokeBuffer = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, smokeBuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    smokeTexture,
    0,
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  // --- Textura del texto -----------------------------------------------------

  const textCanvas = document.createElement('canvas');
  const textContext = textCanvas.getContext('2d')!;
  const textTexture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, textTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // --- Estado ----------------------------------------------------------------

  let width = 1;
  let height = 1;
  let aspect = 1;
  let dpr = 1;

  const blobs: Blob[] = Array.from({ length: MAX_BLOBS }, (_, index) => {
    const isStream = index < STREAM;
    // Mezcla deliberada de tamaños. Si todas son iguales se lee como espuma;
    // lo que parece líquido son masas grandes con gotas pequeñas alrededor.
    const roll = (index * 7) % 10;
    const radius = isStream
      ? 0.155 - index * 0.014
      : roll < 3
        ? 0.13 + roll * 0.022
        : 0.04 + roll * 0.009;

    return {
      x: 0.5,
      y: 0.5,
      vx: 0,
      vy: 0,
      radius,
      weight: isStream ? 1.05 : 0.92,
      seed: index * 19.37,
      // Las masas grandes tienen más inercia y responden menos al campo.
      drag: 0.55 + radius * 4.2,
    };
  });

  let seeded = false;

  /** Reparte las gotas por la pantalla la primera vez que sabemos el aspecto. */
  function seedPositions() {
    blobs.forEach((blob, index) => {
      const angle = index * 2.399;
      const radius = Math.sqrt((index + 0.5) / blobs.length);
      blob.x = (0.5 + Math.cos(angle) * radius * 0.46) * aspect;
      blob.y = 0.5 + Math.sin(angle) * radius * 0.42;
    });
    seeded = true;
  }

  const blobData = new Float32Array(MAX_BLOBS * 4);
  const velData = new Float32Array(MAX_BLOBS * 4);

  const pointer = { x: 0.5, y: 0.55, speed: 0, lastMove: -10 };
  /** Objetivo cuando el cursor está quieto: el chorro se pasea solo. */
  const wander = { x: 0.5, y: 0.5 };

  /** Parte un texto en líneas que quepan en el ancho dado. */
  function wrap(text: string, maxWidth: number): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (textContext.measureText(candidate).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  /**
   * Dibuja una línea repartiendo el espacio sobrante entre sus palabras, para
   * que llegue exactamente al ancho pedido. La última línea de un párrafo no
   * se justifica: quedaría con huecos enormes entre palabras.
   */
  function justify(line: string, x: number, y: number, targetWidth: number) {
    const words = line.split(' ').filter(Boolean);
    if (words.length < 2) {
      textContext.fillText(line, x, y);
      return;
    }

    const wordWidths = words.map((word) => textContext.measureText(word).width);
    const natural = wordWidths.reduce((sum, w) => sum + w, 0);
    const extra = targetWidth - natural;

    // Si hiciera falta estirar demasiado, se deja en bandera: es menos feo
    // que una línea con ríos de espacio en blanco.
    const spacing = extra / (words.length - 1);
    const spaceWidth = textContext.measureText(' ').width;
    if (spacing > spaceWidth * 3.2 || spacing < 0) {
      textContext.fillText(line, x, y);
      return;
    }

    let cursor = x;
    words.forEach((word, index) => {
      textContext.fillText(word, cursor, y);
      cursor += wordWidths[index]! + spacing;
    });
  }

  /**
   * Punto de neón.
   *
   * Un tubo de neón real tiene tres partes: un halo amplio y tenue, un
   * resplandor cercano más intenso, y un núcleo tan brillante que satura a
   * blanco. Solo con shadowBlur se queda en un punto con sombra, sin brillo.
   */
  function neonDot(
    x: number,
    y: number,
    radius: number,
    [r, g, b]: [number, number, number],
  ) {
    const colour = `rgb(${r} ${g} ${b})`;

    textContext.save();

    const haloRadius = radius * 15;
    const halo = textContext.createRadialGradient(x, y, 0, x, y, haloRadius);
    halo.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.85)`);
    halo.addColorStop(0.1, `rgba(${r}, ${g}, ${b}, 0.5)`);
    halo.addColorStop(0.28, `rgba(${r}, ${g}, ${b}, 0.22)`);
    halo.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, 0.06)`);
    halo.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    textContext.fillStyle = halo;
    textContext.fillRect(x - haloRadius, y - haloRadius, haloRadius * 2, haloRadius * 2);

    textContext.shadowColor = colour;
    textContext.shadowBlur = radius * 13;
    textContext.fillStyle = colour;
    textContext.beginPath();
    textContext.arc(x, y, radius * 1.15, 0, Math.PI * 2);
    // Cinco pasadas: cada una acumula la sombra sobre la anterior. Es lo que
    // separa un neón de un círculo con un poco de difuminado.
    for (let pass = 0; pass < 5; pass += 1) textContext.fill();

    // Núcleo: el mismo tono aclarado, no blanco. Un núcleo blanco puro le
    // roba el color al punto y lo deja pareciendo un LED apagado; aclarando
    // sobre el propio tono se mantiene el brillo Y el color.
    const lift = (channel: number) => Math.round(channel + (255 - channel) * 0.4);
    textContext.shadowBlur = radius * 5;
    textContext.shadowColor = colour;
    textContext.fillStyle = `rgb(${lift(r)} ${lift(g)} ${lift(b)})`;
    textContext.beginPath();
    textContext.arc(x, y, radius * 0.5, 0, Math.PI * 2);
    textContext.fill();

    textContext.restore();
  }

  /** Verde y morado de neón para los dos puntos de la fila superior. */
  const NEON_GREEN: [number, number, number] = [95, 247, 198];
  const NEON_PURPLE: [number, number, number] = [182, 96, 255];

  /**
   * Maqueta el bloque de texto, anclado abajo a la izquierda:
   *
   *   ●  ETIQUETA ──────────────── ●  ETIQUETA
   *   Título grande.
   *   Segunda línea, más fina.
   *   Párrafo con el concepto, partido en
   *   líneas del mismo ancho que el título.
   *
   * Todo se ata al ancho del título: el filete de arriba se estira hasta
   * llegar a su borde derecho, y el párrafo se parte a esa misma medida.
   * Así el bloque tiene un borde derecho limpio en vez de tres distintos.
   *
   * Va en el canvas y no en HTML porque el líquido tiene que poder
   * refractarlo al pasar por encima.
   */
  function drawText() {
    // Dos tipografías: una para las líneas grandes y otra para el texto
    // pequeño. Cada una trae su propia corrección de tamaño, porque a igual
    // cuerpo unas llenan mucho más que otras.
    const { title: titleFont, subtitle: subtitleFont, body } = options.fonts;
    const copy = options.copy;

    const margin = Math.max(24, width * 0.055);
    const bigSize = Math.min(Math.max(width * 0.082, 32), 132) * titleFont.sizeScale;
    const eyebrowSize =
      Math.min(Math.max(bigSize * 0.1, 9.5), 14) * body.sizeScale;
    const paraSize =
      Math.min(Math.max(bigSize * 0.163, 13.5), 24) * body.sizeScale;

    const titleStack = `${titleFont.family}, ui-sans-serif, system-ui, sans-serif`;
    const subtitleStack = `${subtitleFont.family}, ui-sans-serif, system-ui, sans-serif`;
    const bodyStack = `${body.family}, ui-sans-serif, system-ui, sans-serif`;

    textCanvas.width = Math.round(width * dpr);
    textCanvas.height = Math.round(height * dpr);
    textContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    textContext.clearRect(0, 0, width, height);
    textContext.textBaseline = 'alphabetic';
    textContext.textAlign = 'left';

    // --- El ancho del título manda sobre todo lo demás ---
    textContext.font = `${titleFont.titleWeight} ${bigSize}px ${titleStack}`;
    textContext.letterSpacing = `${bigSize * titleFont.tracking}px`;
    const blockWidth = Math.min(
      textContext.measureText(copy.title).width,
      width - margin * 2,
    );

    // --- Párrafo: se mide antes porque su alto define dónde empieza todo ---
    const paraWeight = Math.max(body.subtitleWeight, 300);
    textContext.font = `${paraWeight} ${paraSize}px ${bodyStack}`;
    textContext.letterSpacing = '0px';
    const paraLines = wrap(copy.paragraph, blockWidth);
    const paraLeading = paraSize * 1.5;

    const blockBottom = height - margin - 18;
    const paraTop = blockBottom - paraLeading * paraLines.length;

    // --- Las dos líneas grandes ---
    const subtitleBaseline = paraTop - bigSize * 0.34;
    const titleBaseline = subtitleBaseline - bigSize;
    const eyebrowBaseline = titleBaseline - bigSize * 1.06;

    // --- Fila superior: punto de neón, etiqueta, filete, etiqueta ---
    textContext.font = `500 ${eyebrowSize}px ${bodyStack}`;
    textContext.letterSpacing = `${eyebrowSize * 0.16}px`;

    const leftWidth = textContext.measureText(copy.eyebrowLeft).width;
    const rightWidth = textContext.measureText(copy.eyebrowRight).width;

    const dotRadius = eyebrowSize * 0.28;
    const dotGap = eyebrowSize * 0.9;
    const dotSpan = dotRadius * 2 + dotGap;
    const gap = eyebrowSize * 1.5;
    const rowY = eyebrowBaseline - eyebrowSize * 0.3;

    // El filete ocupa lo que sobra hasta el borde derecho del título, ya
    // descontados los dos puntos, las dos etiquetas y sus separaciones.
    const used = dotSpan * 2 + leftWidth + rightWidth + gap * 2;
    const ruleWidth = Math.max(blockWidth - used, eyebrowSize * 2);

    let cursorX = margin;

    neonDot(cursorX + dotRadius, rowY, dotRadius, NEON_GREEN);
    cursorX += dotSpan;

    textContext.fillStyle = 'rgba(255, 255, 255, 0.85)';
    textContext.fillText(copy.eyebrowLeft, cursorX, eyebrowBaseline);
    cursorX += leftWidth + gap;

    textContext.fillStyle = 'rgba(255, 255, 255, 0.35)';
    textContext.fillRect(cursorX, rowY - 0.5, ruleWidth, 1);
    cursorX += ruleWidth + gap;

    neonDot(cursorX + dotRadius, rowY, dotRadius, NEON_PURPLE);
    cursorX += dotSpan;

    textContext.fillStyle = 'rgba(255, 255, 255, 0.6)';
    textContext.fillText(copy.eyebrowRight, cursorX, eyebrowBaseline);

    // --- Línea grande ---
    textContext.letterSpacing = `${bigSize * titleFont.tracking}px`;
    textContext.fillStyle = '#ffffff';
    textContext.font = `${titleFont.titleWeight} ${bigSize}px ${titleStack}`;
    textContext.fillText(copy.title, margin, titleBaseline);

    // --- Segunda línea: mismo cuerpo, menos peso. Si la tipografía no llega
    // a un peso bastante más fino, la diferencia se hace con la opacidad. ---
    // La segunda línea tiene su propio tipo y su propia escala.
    const subtitleSize = bigSize * (subtitleFont.sizeScale / titleFont.sizeScale);
    const weightGap = subtitleFont.titleWeight - subtitleFont.subtitleWeight;
    textContext.fillStyle =
      weightGap < 150 ? 'rgba(255, 255, 255, 0.62)' : 'rgba(255, 255, 255, 0.9)';
    textContext.font = `${subtitleFont.subtitleWeight} ${subtitleSize}px ${subtitleStack}`;
    textContext.letterSpacing = `${subtitleSize * subtitleFont.tracking}px`;
    textContext.fillText(copy.subtitle, margin, subtitleBaseline);

    // --- Párrafo ---
    textContext.font = `${paraWeight} ${paraSize}px ${bodyStack}`;
    textContext.letterSpacing = '0px';
    textContext.fillStyle = 'rgba(255, 255, 255, 0.66)';
    paraLines.forEach((line, index) => {
      const y = paraTop + paraLeading * (index + 0.8);
      if (index === paraLines.length - 1) textContext.fillText(line, margin, y);
      else justify(line, margin, y, blockWidth);
    });

    gl!.bindTexture(gl!.TEXTURE_2D, textTexture);
    gl!.pixelStorei(gl!.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl!.texImage2D(
      gl!.TEXTURE_2D,
      0,
      gl!.RGBA,
      gl!.RGBA,
      gl!.UNSIGNED_BYTE,
      textCanvas,
    );
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    width = Math.max(rect.width, 1);
    height = Math.max(rect.height, 1);
    aspect = width / height;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    const smokeWidth = Math.max(Math.round(canvas.width * SMOKE_SCALE), 1);
    const smokeHeight = Math.max(Math.round(canvas.height * SMOKE_SCALE), 1);
    gl!.bindTexture(gl!.TEXTURE_2D, smokeTexture);
    gl!.texImage2D(
      gl!.TEXTURE_2D,
      0,
      gl!.RGBA,
      smokeWidth,
      smokeHeight,
      0,
      gl!.RGBA,
      gl!.UNSIGNED_BYTE,
      null,
    );

    drawText();
  }

  function step(time: number, delta: number) {
    if (options.plain) {
      // Peso cero: el shader descarta las gotas y solo queda la escena.
      blobData.fill(0);
      velData.fill(0);
      return;
    }

    if (!seeded) seedPositions();

    // Paseo autónomo: si el cursor lleva quieto más de un segundo, el chorro
    // sigue su propio recorrido turbulento. Sin esto, con el ratón parado la
    // escena se congela y parece rota.
    const idle = time - pointer.lastMove;
    const [wx, wy] = curl(wander.x * 1.3, wander.y * 1.3 + 40, time * 0.6);
    wander.x += wx * delta * 0.42;
    wander.y += wy * delta * 0.42;
    wander.x = Math.min(Math.max(wander.x, 0.12), aspect - 0.12);
    // El paseo se mantiene en los dos tercios altos: abajo a la izquierda
    // está el bloque de texto y el líquido lo dejaría ilegible.
    wander.y = Math.min(Math.max(wander.y, 0.42), 0.88);

    const blend = Math.min(Math.max((idle - 0.9) / 1.4, 0), 1);
    const target = {
      x: pointer.x * aspect * (1 - blend) + wander.x * blend,
      y: pointer.y * (1 - blend) + wander.y * blend,
    };

    const centre = aspect / 2;

    for (let index = 0; index < blobs.length; index += 1) {
      const blob = blobs[index]!;

      if (index < STREAM) {
        // Cadena: la primera persigue el objetivo, cada una a la anterior.
        // El retardo creciente es lo que estira el chorro.
        const lead = index === 0 ? target : blobs[index - 1]!;
        const pull = index === 0 ? 6.5 : 9;
        blob.vx = (blob.vx + (lead.x - blob.x) * pull * delta) * 0.87;
        blob.vy = (blob.vy + (lead.y - blob.y) * pull * delta) * 0.87;
      } else {
        // Turbulencia: el campo curl las arrastra en remolinos.
        const [cx, cy] = curl(blob.x * 1.9 + blob.seed, blob.y * 1.9, time);
        blob.vx += (cx * 1.15 * delta) / blob.drag;
        blob.vy += (cy * 1.15 * delta) / blob.drag;

        // Atracción floja a un centro desplazado hacia arriba: si no, el
        // campo las acaba echando fuera, y abajo a la izquierda tapan el texto.
        blob.vx += (centre - blob.x) * 0.55 * delta;
        blob.vy += (0.62 - blob.y) * 0.75 * delta;

        // Empuje del cursor: al pasar rápido, salpica las gotas cercanas.
        const dx = blob.x - target.x;
        const dy = blob.y - target.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < 0.12 && dist2 > 0.0001) {
          const force = (0.12 - dist2) * 26 * (0.35 + pointer.speed * 5);
          const inv = 1 / Math.sqrt(dist2);
          blob.vx += dx * inv * force * delta;
          blob.vy += dy * inv * force * delta;
        }

        blob.vx *= 0.975;
        blob.vy *= 0.975;
      }

      blob.x += blob.vx * delta;
      blob.y += blob.vy * delta;

      // Rebote blando en los bordes: las gotas se quedan dentro del encuadre
      // sin el corte brusco de un wrap.
      const pad = blob.radius * 0.6;
      if (blob.x < pad) { blob.x = pad; blob.vx = Math.abs(blob.vx) * 0.55; }
      if (blob.x > aspect - pad) { blob.x = aspect - pad; blob.vx = -Math.abs(blob.vx) * 0.55; }
      if (blob.y < pad) { blob.y = pad; blob.vy = Math.abs(blob.vy) * 0.55; }
      if (blob.y > 1 - pad) { blob.y = 1 - pad; blob.vy = -Math.abs(blob.vy) * 0.55; }

      const offset = index * 4;
      blobData[offset] = blob.x;
      blobData[offset + 1] = blob.y;
      blobData[offset + 2] = blob.radius;
      blobData[offset + 3] = blob.weight;
      velData[offset] = blob.vx;
      velData[offset + 1] = blob.vy;
    }

    // La velocidad del cursor decae sola: si no, un movimiento brusco dejaría
    // el empuje activado para siempre.
    pointer.speed *= Math.pow(0.02, delta);
  }

  function render(time: number) {
    // --- Humo, a media resolución, en su textura ---
    const smokeWidth = Math.max(Math.round(canvas.width * SMOKE_SCALE), 1);
    const smokeHeight = Math.max(Math.round(canvas.height * SMOKE_SCALE), 1);

    gl!.bindFramebuffer(gl!.FRAMEBUFFER, smokeBuffer);
    gl!.viewport(0, 0, smokeWidth, smokeHeight);
    gl!.useProgram(smokeProgram);
    gl!.uniform2f(smokeUniforms.get('uResolution')!, smokeWidth, smokeHeight);
    gl!.uniform1f(smokeUniforms.get('uTime')!, time);
    gl!.bindVertexArray(vao);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);

    // --- Líquido, a pantalla ---
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    gl!.viewport(0, 0, canvas.width, canvas.height);
    gl!.useProgram(liquidProgram);

    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, smokeTexture);
    gl!.uniform1i(liquidUniforms.get('uSmoke')!, 0);

    gl!.activeTexture(gl!.TEXTURE1);
    gl!.bindTexture(gl!.TEXTURE_2D, textTexture);
    gl!.uniform1i(liquidUniforms.get('uText')!, 1);

    gl!.uniform2f(liquidUniforms.get('uResolution')!, canvas.width, canvas.height);
    gl!.uniform1f(liquidUniforms.get('uTime')!, time);
    gl!.uniform1f(liquidUniforms.get('uThreshold')!, 0.52);
    gl!.uniform1f(liquidUniforms.get('uEdge')!, 0.34);
    gl!.uniform1f(liquidUniforms.get('uRefract')!, 0.075);
    gl!.uniform1f(liquidUniforms.get('uDispersion')!, 0.26);
    gl!.uniform4fv(liquidUniforms.get('uBlobs')!, blobData);
    gl!.uniform4fv(liquidUniforms.get('uBlobVel')!, velData);

    gl!.bindVertexArray(vao);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }

  // --- Ciclo -----------------------------------------------------------------

  let frame = 0;
  let running = false;
  let last = 0;
  let elapsed = 0;

  function tick(now: number) {
    frame = requestAnimationFrame(tick);
    const seconds = now / 1000;
    const delta = last === 0 ? 1 / 60 : Math.min(seconds - last, 0.05);
    last = seconds;
    elapsed += delta;
    step(elapsed, delta);
    render(elapsed);
  }

  function start() {
    if (running) return;
    running = true;
    last = 0;
    frame = requestAnimationFrame(tick);
  }

  function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(frame);
  }

  function onPointerMove(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    const nx = (event.clientX - rect.left) / rect.width;
    const ny = 1 - (event.clientY - rect.top) / rect.height;

    // La velocidad alimenta el empuje que salpica las gotas cercanas.
    pointer.speed = Math.min(Math.hypot(nx - pointer.x, ny - pointer.y) * 14, 3);
    pointer.x = nx;
    pointer.y = ny;
    pointer.lastMove = elapsed;
  }

  const resizeObserver = new ResizeObserver(() => {
    resize();
    if (!running) {
      step(elapsed, 1 / 60);
      render(elapsed);
    }
  });
  resizeObserver.observe(canvas);

  const intersectionObserver = new IntersectionObserver(
    ([entry]) => {
      if (entry?.isIntersecting && !options.reducedMotion) start();
      else stop();
    },
    { threshold: 0 },
  );
  intersectionObserver.observe(canvas);

  function onVisibility() {
    if (document.hidden) stop();
    else if (canvas.isConnected && !options.reducedMotion) start();
  }

  document.addEventListener('visibilitychange', onVisibility);
  if (!options.reducedMotion) {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
  }

  resize();
  step(0, 1 / 60);
  render(0);

  return {
    destroy() {
      stop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onPointerMove);
      gl!.deleteProgram(smokeProgram);
      gl!.deleteProgram(liquidProgram);
      gl!.deleteTexture(smokeTexture);
      gl!.deleteTexture(textTexture);
      gl!.deleteFramebuffer(smokeBuffer);
      gl!.deleteVertexArray(vao);
    },
  };
}

/** Una promesa por familia: la misma fuente no se descarga dos veces. */
const fontPromises = new Map<string, Promise<void>>();

function loadFont(font: HeroFont): Promise<void> {
  const cached = fontPromises.get(font.family);
  if (cached) return cached;

  const base = import.meta.env.BASE_URL.replace(/\/*$/, '/');
  const face = new FontFace(
    font.family,
    `url(${base}fonts/${font.file}) format("woff2")`,
    { weight: '100 900', display: 'block' },
  );

  const promise = face
    .load()
    .then((loaded) => {
      document.fonts.add(loaded);
    })
    .catch(() => {
      // Si falla, el canvas usa la de respaldo del sistema. No se rompe nada.
    });

  fontPromises.set(font.family, promise);
  return promise;
}
