import { curl } from './noise';
import type { HeroCopy, HeroFont, HeroFonts } from './fonts';
import { FLOW, LIQUID, SMOKE, VERTEX } from './shaders';
import { MARK_PRESETS } from './marks';

const MAX_BLOBS = 24;
/**
 * Gotas encadenadas que siguen al cursor; el resto viven por su cuenta.
 *
 * La cadena es lo que deja el rastro: cuantos más eslabones, más larga es la
 * cinta que queda detrás del cursor y más tarda en recogerse.
 */
const STREAM = 12;

/**
 * Hacia dónde se recuesta la masa de líquido, en fracción del ancho.
 *
 * Centrada justo encima del título la deformaba demasiado; corrida a la
 * derecha, el bloque de texto —que está abajo a la izquierda— queda despejado.
 */
const MASS_BIAS_X = 0.62;

/**
 * Multiplica el tamaño de todas las gotas sin tocar dónde viven. El largo de
 * los eslabones de la cadena se calcula a partir del radio, así que la cinta
 * se estira en la misma proporción y la masa crece sin desmontarse.
 */
const MASS_SCALE = 1.22;
/** El humo es de frecuencia baja: a media resolución no se aprecia. */
const SMOKE_SCALE = 0.5;
/**
 * La huella del cursor es aún más suave que el humo: a un cuarto de
 * resolución no se distingue, y así el ping-pong de cada fotograma es barato.
 */
const FLOW_SCALE = 0.25;
/**
 * Cómo responde la masa a la inclinación, dicho en términos de tacto y no de
 * constantes sueltas: de aquí salen luego el muelle y el rozamiento.
 *
 * - RESPONSE es la rapidez, en radianes por segundo. Con 13 la masa está
 *   colocada en algo más de medio segundo, que es lo que hace falta para que
 *   se lea como consecuencia de haber movido el móvil y no como casualidad.
 * - DAMPING por debajo de 1 deja que se pase de largo y vuelva: eso es el
 *   vaivén del agua. A 1 llegaría clavada y parecería un panel deslizándose.
 */
const POOL_RESPONSE = 13;
const POOL_DAMPING = 0.55;

/**
 * Con el giroscopio dando datos, cuánto queda del paseo autónomo.
 *
 * Casi nada, y es deliberado: si el agua se mueve sola no hay forma de
 * atribuirle al giro lo que ves moverse. Es la diferencia entre un fondo
 * animado y un mando.
 */
const GYRO_DRIFT = 0.12;

/** Radio de la brocha que estampa el cursor, en unidades de aspecto. */
const FLOW_RADIUS = 0.19;
/** Qué fracción de la huella sobrevive cada segundo. */
const FLOW_DECAY = 0.05;
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
  /** Cuál de las composiciones de marcas se pinta. 0 = ninguna. */
  marks?: number;
  /**
   * Apaga el líquido y deja solo humo y texto. Sirve para juzgar la
   * maquetación: con el líquido encima no se puede leer nada.
   */
  plain?: boolean;
}

export interface LiquidHandle {
  destroy(): void;
  /** Cambia la composición de marcas y repinta el texto. */
  setMarks(index: number): void;
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
  /**
   * Hacia dónde iba, normalizado y suavizado. Persiste cuando la gota se
   * para, y es lo que tiende la cadena a lo largo del recorrido del cursor.
   */
  dirX: number;
  dirY: number;
}

/** Una palabra de la segunda línea que se enciende al pasar el ratón. */
interface HotWord {
  text: string;
  /** Caja en píxeles CSS de la página, para acertar con el cursor. */
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** Color al que se enciende, o null si esta palabra no se enciende. */
  colour: [number, number, number] | null;
  /** 0 apagada, 1 encendida del todo. */
  glow: number;
}

/** Transición suave entre dos umbrales, como la de los shaders. */
function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
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
  const flowProgram = link(gl, VERTEX, FLOW);
  const smokeUniforms = uniforms(gl, smokeProgram);
  const liquidUniforms = uniforms(gl, liquidProgram);
  const flowUniforms = uniforms(gl, flowProgram);

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

  // --- Huella del cursor -----------------------------------------------------

  // Con coma flotante a media precisión si el equipo la tiene. En RGBA8 la
  // huella se guarda en 256 escalones y el arrastre avanza a saltos visibles;
  // en RGBA16F es continuo. El empaquetado con el cero en 0.5 se mantiene en
  // ambos casos para que el shader sea el mismo.
  const floatFlow =
    gl.getExtension('EXT_color_buffer_half_float') ??
    gl.getExtension('EXT_color_buffer_float');
  const flowInternal = floatFlow ? gl.RGBA16F : gl.RGBA;
  const flowType = floatFlow ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

  // Dos texturas, no una: el flowmap se lee a sí mismo para atenuarse, y en
  // WebGL no se puede leer y escribir la misma textura en la misma pasada.
  // Así que se alternan — el clásico ping-pong.
  const flowTextures = [gl.createTexture()!, gl.createTexture()!];
  const flowBuffers = [gl.createFramebuffer()!, gl.createFramebuffer()!];

  for (let index = 0; index < 2; index += 1) {
    gl.bindTexture(gl.TEXTURE_2D, flowTextures[index]!);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, flowBuffers[index]!);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      flowTextures[index]!,
      0,
    );
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  /** Cuál de las dos tiene la huella buena ahora mismo. */
  let flowIndex = 0;
  let flowWidth = 1;
  let flowHeight = 1;

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
    const radius =
      MASS_SCALE *
      (isStream
        ? 0.148 - index * 0.0082
        : roll < 3
          ? 0.13 + roll * 0.022
          : 0.04 + roll * 0.009);

    return {
      x: 0.5,
      y: 0.5,
      vx: 0,
      vy: 0,
      radius,
      weight: isStream ? 1.05 : 0.92,
      seed: index * 19.37,
      dirX: 1,
      dirY: 0,
      // Las masas grandes tienen más inercia y responden menos al campo.
      drag: 0.55 + radius * 4.2,
    };
  });

  /** Radio de cada gota antes de corregirlo por la forma del encuadre. */
  const baseRadii = blobs.map((blob) => blob.radius);

  /**
   * Ajusta el tamaño de las gotas a la forma de la pantalla.
   *
   * El eje X va de 0 a `aspect` y el Y de 0 a 1, así que las gotas se miden
   * en unidades de ALTO. En un portátil apaisado el encuadre mide 1.6 de
   * ancho y una gota de 0.18 ocupa un noveno; en un móvil el encuadre mide
   * 0.46 y esa misma gota ocupa casi la mitad. Sin corregirlo, la cinta se
   * pasa la vida encajonada contra las paredes, que es de donde salen los
   * tropezones.
   */
  function fitBlobs() {
    const fit = Math.min(1, 0.52 + aspect * 0.42);
    blobs.forEach((blob, index) => {
      blob.radius = baseRadii[index]! * fit;
    });
  }

  let seeded = false;
  let marksIndex = options.marks ?? 5;

  /** Reparte las gotas por la pantalla la primera vez que sabemos el aspecto. */
  function seedPositions() {
    blobs.forEach((blob, index) => {
      const angle = index * 2.399;
      const radius = Math.sqrt((index + 0.5) / blobs.length);
      blob.x = (MASS_BIAS_X + Math.cos(angle) * radius * 0.42) * aspect;
      blob.y = 0.5 + Math.sin(angle) * radius * 0.42;
    });
    seeded = true;
  }

  /**
   * Caja que ocupan el título y el subtítulo, en UV y con el eje Y hacia
   * arriba. La calcula drawText() y la lee el shader para saber dónde puede
   * apretar la aberración cromática sin comerse las líneas pequeñas.
   */
  const bigTextBox = new Float32Array([0, 0, 1, 1]);

  /**
   * La segunda línea vive en su propio lienzo.
   *
   * Sus palabras se encienden al pasar el ratón, y eso hay que repintarlo
   * mientras dura la transición. Repintando la textura entera serían quince
   * megas por fotograma; repintando solo esta tira y subiéndola con
   * texSubImage2D son menos de uno.
   */
  const subtitleCanvas = document.createElement('canvas');
  const subtitleContext = subtitleCanvas.getContext('2d')!;
  let hotWords: HotWord[] = [];
  /** Esquina del lienzo pequeño dentro del grande, en píxeles CSS. */
  const subtitleOrigin = { x: 0, y: 0 };
  let subtitleStyle = { font: '', spacing: '0px', size: 0, alpha: 0.9, baseline: 0 };

  const blobData = new Float32Array(MAX_BLOBS * 4);
  const velData = new Float32Array(MAX_BLOBS * 4);

  const pointer = { x: 0.5, y: 0.55, speed: 0, lastMove: -10 };
  /**
   * Cuánto se ha movido el cursor desde la última vez que se estampó la
   * huella. Se acumula porque pueden llegar varios eventos de ratón entre
   * dos fotogramas, y si se cogiera solo el último se perdería parte del
   * recorrido justo en los movimientos rápidos, que son los que importan.
   */
  const pointerDelta = { x: 0, y: 0 };
  /** Objetivo cuando el cursor está quieto: el chorro se pasea solo. */
  const wander = { x: 0.5, y: 0.5 };
  /**
   * El objetivo que persigue de verdad la cadena, suavizado.
   *
   * El objetivo crudo da saltos: cuando el cursor vuelve a moverse tras estar
   * parado, salta del paseo autónomo a donde esté el ratón; y un movimiento
   * brusco del ratón lo teletransporta. Cada salto se transmitía entero a la
   * cabeza de la cadena y se sentía como un tropezón. Metiendo una etapa más
   * de retardo, el objetivo no puede saltar nunca.
   */
  const aim = { x: 0.5, y: 0.6 };
  /**
   * El bloque de texto, en las unidades del shader, y con cuánta fuerza
   * rechaza al líquido. Lo calcula drawText().
   */
  const textZone = { right: 0.9, top: 0.6, strength: 0.16 };
  /**
   * El charco: cuánto se ha corrido la masa por la gravedad.
   *
   * Es un muelle amortiguado y no un desplazamiento fijo, y esa es toda la
   * diferencia: al enderezar el móvil el líquido vuelve bamboleándose en vez
   * de saltar a su sitio, que es lo que hace que parezca agua y no una capa
   * que se desplaza.
   */
  const pool = { x: 0, y: 0, vx: 0, vy: 0 };
  /** Inclinación del móvil, ya suavizada. */
  const gyro = {
    x: 0,
    y: 0,
    rawX: 0,
    rawY: 0,
    base: null as null | [number, number],
    source: 'none' as 'none' | 'orientation' | 'motion',
    /** True en cuanto ha llegado alguna lectura: hay sensor de verdad. */
    live: false,
  };
  /**
   * Inclinación de la escena hacia el cursor, suavizada.
   *
   * No puede ser un transform de CSS: el texto no está en el DOM, está pintado
   * dentro de la textura que refracta el líquido. Se hace en el shader, y de
   * paso el humo y el texto se inclinan distinto, que es lo que da la
   * sensación de profundidad.
   */
  const tilt = { x: 0, y: 0 };

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

    // Cuánto de "pantalla estrecha" tiene esto: 0 en un portátil, 1 en un
    // móvil. Todas las proporciones se interpolan con él en vez de saltar en
    // un punto de ruptura, así que no hay ningún ancho en el que el bloque
    // pegue un salto de tamaño al redimensionar.
    const compact = Math.min(Math.max((820 - width) / (820 - 380), 0), 1);

    const margin = Math.max(20, width * (0.055 + compact * 0.018));
    const available = width - margin * 2;

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
    // En pantalla estrecha el título tiene que ocupar mucha más proporción
    // del ancho o se queda en una nota a pie de página.
    let bigSize =
      Math.min(Math.max(width * (0.082 + compact * 0.06), 30), 132) * titleFont.sizeScale;

    // Y se encaja: se mide a ese cuerpo y se reduce hasta que cabe justo
    // entre los márgenes. Recortarlo con un tope de ancho, como antes,
    // dejaba el título saliéndose del margen en cuanto la pantalla se
    // estrechaba; así sale siempre tan grande como quepa y ni un píxel más.
    textContext.font = `${titleFont.titleWeight} ${bigSize}px ${titleStack}`;
    textContext.letterSpacing = `${bigSize * titleFont.tracking}px`;
    const naturalTitle = textContext.measureText(copy.title).width;
    if (naturalTitle > available) {
      bigSize *= available / naturalTitle;
      textContext.font = `${titleFont.titleWeight} ${bigSize}px ${titleStack}`;
      textContext.letterSpacing = `${bigSize * titleFont.tracking}px`;
    }
    const blockWidth = Math.min(textContext.measureText(copy.title).width, available);

    // Las líneas pequeñas no pueden encoger al ritmo del título: a 13 px un
    // párrafo deja de leerse. Suben su proporción según se estrecha la
    // pantalla, y llevan un suelo en píxeles por debajo del cual no bajan.
    let eyebrowSize =
      Math.min(Math.max(bigSize * (0.1 + compact * 0.06), 10), 15) * body.sizeScale;
    const paraSize =
      Math.min(Math.max(bigSize * (0.163 + compact * 0.15), 15), 25) * body.sizeScale;

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
    // Todo lo de esta fila es proporcional a su cuerpo, así que se mide una
    // vez y, si no cabe, se reescala entera de una tacada.
    const measureRow = (size: number) => {
      textContext.font = `500 ${size}px ${bodyStack}`;
      textContext.letterSpacing = `${size * 0.16}px`;
      const left = textContext.measureText(copy.eyebrowLeft).width;
      const right = textContext.measureText(copy.eyebrowRight).width;
      const radius = size * 0.28;
      const span = radius * 2 + size * 0.9;
      const separation = size * 1.5;
      return {
        left,
        right,
        radius,
        span,
        gap: separation,
        used: span * 2 + left + right + separation * 2,
      };
    };

    let row = measureRow(eyebrowSize);
    // El filete es lo que da a entender que la fila es una sola pieza, así
    // que antes de dejarlo desaparecer se encoge el cuerpo de la fila. Es
    // preferible a partirla en dos líneas: es un único gesto.
    const rowFit = blockWidth / (row.used + eyebrowSize * 2.5);
    if (rowFit < 1) {
      eyebrowSize *= rowFit;
      row = measureRow(eyebrowSize);
    }

    const leftWidth = row.left;
    const dotRadius = row.radius;
    const dotSpan = row.span;
    const gap = row.gap;
    const rowY = eyebrowBaseline - eyebrowSize * 0.3;

    // El filete ocupa lo que sobra hasta el borde derecho del título, ya
    // descontados los dos puntos, las dos etiquetas y sus separaciones.
    const used = row.used;
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

    // --- Marcas gráficas, en el aire que deja libre el texto ---
    // Van en el canvas y no en HTML porque son decoración: si el agua no las
    // deformara al pasar por encima, se notaría que están pegadas.
    MARK_PRESETS[marksIndex]?.draw({
      ctx: textContext,
      width,
      height,
      margin,
      blockWidth,
      bigSize,
      eyebrowBaseline,
      titleBaseline,
      subtitleBaseline,
      blockBottom,
      compact,
    });

    // --- Línea grande ---
    textContext.letterSpacing = `${bigSize * titleFont.tracking}px`;
    textContext.fillStyle = '#ffffff';
    textContext.font = `${titleFont.titleWeight} ${bigSize}px ${titleStack}`;
    textContext.fillText(copy.title, margin, titleBaseline);

    // --- Segunda línea: mismo cuerpo, menos peso. Si la tipografía no llega
    // a un peso bastante más fino, la diferencia se hace con la opacidad. ---
    // La segunda línea tiene su propio tipo y su propia escala. Y NO se pinta
    // aquí: se mide aquí y se pinta en drawSubtitle(), sobre su propio
    // lienzo, porque tiene que poder repintarse sola.
    const subtitleSize = bigSize * (subtitleFont.sizeScale / titleFont.sizeScale);
    const weightGap = subtitleFont.titleWeight - subtitleFont.subtitleWeight;
    const subtitleAlpha = weightGap < 150 ? 0.62 : 0.9;
    const subtitleCss = `${subtitleFont.subtitleWeight} ${subtitleSize}px ${subtitleStack}`;
    const subtitleSpacing = `${subtitleSize * subtitleFont.tracking}px`;
    textContext.font = subtitleCss;
    textContext.letterSpacing = subtitleSpacing;

    // La tira que ocupa la línea. Subirla pisa lo que hubiera ahí, así que se
    // recorta para no llegar ni a las colas del título ni a la primera línea
    // del párrafo — con otro texto podrían quedar dentro y se borrarían.
    const paraFirstTop = paraTop + paraLeading * 0.8 - paraSize * 0.95;
    const boxTop = Math.max(
      subtitleBaseline - subtitleSize * 0.95,
      titleBaseline + bigSize * 0.24,
    );
    const boxBottom = Math.min(subtitleBaseline + subtitleSize * 0.34, paraFirstTop);
    const boxLeft = Math.max(margin - subtitleSize * 0.3, 0);
    const subtitleWidth = textContext.measureText(copy.subtitle).width;
    const boxRight = Math.min(margin + subtitleWidth + subtitleSize * 0.4, width);

    // Cada palabra se coloca midiendo el prefijo que la precede, así cae
    // donde caería si la línea se pintara de una tirada.
    const words = copy.subtitle.split(' ').filter(Boolean);
    hotWords = words.map((text, index) => {
      const prefix = words.slice(0, index).join(' ');
      const offset = prefix ? textContext.measureText(`${prefix} `).width : 0;
      // La primera se enciende en verde y la última en morado: los mismos dos
      // colores, en el mismo orden, que los puntos de la fila de arriba. Lo
      // que quede en medio no se enciende.
      const colour =
        index === 0
          ? NEON_GREEN
          : index === words.length - 1
            ? NEON_PURPLE
            : null;
      return {
        text,
        left: margin + offset,
        right: margin + offset + textContext.measureText(text).width,
        top: boxTop,
        bottom: boxBottom,
        colour,
        glow: 0,
      };
    });

    // --- Zona que el líquido tiene que respetar ---
    // En unidades del shader: el eje X va de 0 a aspect y el Y de 0 a 1 hacia
    // arriba, así que ambos se dividen por el ALTO.
    textZone.right = (margin + blockWidth) / height;
    textZone.top = 1 - (eyebrowBaseline - bigSize * 0.9) / height;
    // En móvil el texto ocupa todo el ancho de abajo y no hay hueco al que
    // apartarse de lado, así que el empuje hacia arriba tiene que ser mayor.
    textZone.strength = 0.15 + compact * 0.22;

    subtitleOrigin.x = boxLeft;
    subtitleOrigin.y = boxTop;
    subtitleStyle = {
      font: subtitleCss,
      spacing: subtitleSpacing,
      size: subtitleSize,
      alpha: subtitleAlpha,
      baseline: subtitleBaseline - boxTop,
    };
    subtitleCanvas.width = Math.max(Math.round((boxRight - boxLeft) * dpr), 1);
    subtitleCanvas.height = Math.max(Math.round((boxBottom - boxTop) * dpr), 1);

    // --- Párrafo ---
    textContext.font = `${paraWeight} ${paraSize}px ${bodyStack}`;
    textContext.letterSpacing = '0px';
    textContext.fillStyle = 'rgba(255, 255, 255, 0.66)';
    paraLines.forEach((line, index) => {
      const y = paraTop + paraLeading * (index + 0.8);
      if (index === paraLines.length - 1) textContext.fillText(line, margin, y);
      else justify(line, margin, y, blockWidth);
    });

    // --- Caja de las dos líneas grandes, para el shader ---
    // El eje Y del canvas baja y el del shader sube, de ahí las restas.
    const glitchTop = titleBaseline - bigSize * 0.82;
    const glitchBottom = subtitleBaseline + bigSize * 0.26;
    bigTextBox[0] = (margin - bigSize * 0.06) / width;
    bigTextBox[1] = 1 - glitchBottom / height;
    bigTextBox[2] = (margin + blockWidth + bigSize * 0.06) / width;
    bigTextBox[3] = 1 - glitchTop / height;

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

    drawSubtitle();
  }

  /**
   * Pinta la segunda línea en su lienzo y sube solo ese rectángulo.
   *
   * Cada palabra se dibuja por separado porque cada una puede llevar su
   * propio color y su propia escala. La escala va alrededor del centro de la
   * palabra, no de su origen: creciendo desde el origen, empujaría a las que
   * tiene detrás y la línea entera bailaría.
   */
  function drawSubtitle() {
    if (!hotWords.length) return;

    const style = subtitleStyle;
    const cssWidth = subtitleCanvas.width / dpr;
    const cssHeight = subtitleCanvas.height / dpr;

    subtitleContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    subtitleContext.clearRect(0, 0, cssWidth, cssHeight);
    subtitleContext.textBaseline = 'alphabetic';
    subtitleContext.textAlign = 'left';
    subtitleContext.font = style.font;
    subtitleContext.letterSpacing = style.spacing;

    for (const word of hotWords) {
      const x = word.left - subtitleOrigin.x;
      const [r, g, b] = word.colour ?? [255, 255, 255];
      // Del blanco al color del punto, y de paso subiendo la opacidad: es lo
      // que hace que se lea como que se enciende y no como que se tiñe.
      const tint = (channel: number) => Math.round(255 + (channel - 255) * word.glow);
      const alpha = style.alpha + (1 - style.alpha) * word.glow;

      subtitleContext.save();
      if (word.glow > 0.0005) {
        const centreX = x + (word.right - word.left) / 2;
        const centreY = style.baseline - style.size * 0.32;
        const scale = 1 + 0.05 * word.glow;
        subtitleContext.translate(centreX, centreY);
        subtitleContext.scale(scale, scale);
        subtitleContext.translate(-centreX, -centreY);
      }
      subtitleContext.fillStyle = `rgba(${tint(r)}, ${tint(g)}, ${tint(b)}, ${alpha})`;
      subtitleContext.fillText(word.text, x, style.baseline);
      subtitleContext.restore();
    }

    gl!.bindTexture(gl!.TEXTURE_2D, textTexture);
    gl!.pixelStorei(gl!.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl!.texSubImage2D(
      gl!.TEXTURE_2D,
      0,
      Math.round(subtitleOrigin.x * dpr),
      Math.round(subtitleOrigin.y * dpr),
      gl!.RGBA,
      gl!.UNSIGNED_BYTE,
      subtitleCanvas,
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

    fitBlobs();

    flowWidth = Math.max(Math.round(canvas.width * FLOW_SCALE), 1);
    flowHeight = Math.max(Math.round(canvas.height * FLOW_SCALE), 1);
    for (let index = 0; index < 2; index += 1) {
      gl!.bindTexture(gl!.TEXTURE_2D, flowTextures[index]!);
      gl!.texImage2D(
        gl!.TEXTURE_2D,
        0,
        flowInternal,
        flowWidth,
        flowHeight,
        0,
        gl!.RGBA,
        flowType,
        null,
      );
      // Se limpian a 0.5, que es el cero de la velocidad con este
      // empaquetado. Dejarlas a negro equivaldría a una huella a tope
      // apuntando abajo a la izquierda en toda la pantalla.
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, flowBuffers[index]!);
      gl!.viewport(0, 0, flowWidth, flowHeight);
      gl!.clearColor(0.5, 0.5, 0, 1);
      gl!.clear(gl!.COLOR_BUFFER_BIT);
    }
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);

    drawText();
  }

  /**
   * Cuánto hay que levantar un punto para que no se quede encima del texto.
   *
   * No es un tope: vale cero fuera de la zona y crece al cuadrado según el
   * punto se mete hacia abajo. Por eso la masa SÍ puede bajar sobre el texto
   * —y se le nota el esfuerzo— pero acaba saliendo sola. Con un tope duro se
   * vería un techo invisible; así parece flotabilidad.
   */
  function textLift(x: number, y: number) {
    if (y >= textZone.top) return 0;
    // A la derecha del bloque no hay nada que tapar, así que el empuje se
    // apaga en cuanto se sale de su ancho.
    const across = 1 - smoothstep(textZone.right, textZone.right + 0.3, x);
    if (across <= 0) return 0;
    const depth = (textZone.top - y) / Math.max(textZone.top, 0.001);
    // Con el móvil ladeado el empuje se afloja: si no, al inclinar hacia el
    // texto el agua se quedaría flotando encima sin poder bajar, y se vería
    // que hay una mano invisible sujetándola.
    const tilted = 1 - Math.min(Math.hypot(gyro.x, gyro.y), 1) * 0.55;
    return across * depth * depth * textZone.strength * tilted;
  }

  function step(time: number, delta: number) {
    // Siempre, aunque el líquido esté apagado: la inclinación es de la escena.
    // El signo es el que acerca hacia el ojo el lado donde está el cursor.
    const ease = 1 - Math.pow(0.2, delta);
    tilt.x += (-(pointer.x - 0.5) * 0.15 - tilt.x) * ease;
    tilt.y += (-(pointer.y - 0.5) * 0.15 - tilt.y) * ease;

    // --- Palabras que se encienden al pasar el ratón por encima ---
    // Se repinta solo mientras alguna está cambiando; paradas, no cuesta nada.
    if (hotWords.length) {
      const cursorX = pointer.x * width;
      const cursorY = (1 - pointer.y) * height;
      const rise = 1 - Math.pow(0.3, delta);
      let repaint = false;

      for (const word of hotWords) {
        if (!word.colour) continue;
        const over =
          cursorX >= word.left &&
          cursorX <= word.right &&
          cursorY >= word.top &&
          cursorY <= word.bottom;
        const next = word.glow + ((over ? 1 : 0) - word.glow) * rise;
        if (Math.abs(next - word.glow) > 0.0005) repaint = true;
        word.glow = next;
      }

      if (repaint) drawSubtitle();
    }

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
    // Tirón flojo hacia el punto de reposo: sin él, el campo turbulento
    // acaba llevándose el paseo a una esquina y se queda ahí.
    wander.x += (MASS_BIAS_X * aspect - wander.x) * 0.5 * delta;
    // Los topes van en fracción del ancho, no en unidades fijas: con un
    // tope fijo, en un móvil el paseo se quedaba encerrado en una caja de
    // dos dedos y se leía como un temblor.
    wander.x = Math.min(Math.max(wander.x, aspect * 0.2), aspect * 0.82);
    // El paseo se mantiene en los dos tercios altos: abajo a la izquierda
    // está el bloque de texto y el líquido lo dejaría ilegible.
    wander.y = Math.min(Math.max(wander.y, 0.42), 0.88);

    const blend = Math.min(Math.max((idle - 0.9) / 1.4, 0), 1);

    // Con el sensor dando datos el paseo autónomo se apaga casi del todo y la
    // masa se queda en un punto de reposo fijo. Es LO MÁS importante de todo
    // esto: mientras el agua se movía sola, ningún movimiento que vieras
    // podías atribuírselo al giro, por mucha fuerza que le metiera.
    const restX = MASS_BIAS_X * aspect;
    const drift = gyro.live ? GYRO_DRIFT : 1;
    const idleX = restX + (wander.x - restX) * drift;
    const idleY = 0.62 + (wander.y - 0.62) * drift;

    let rawX = pointer.x * aspect * (1 - blend) + idleX * blend;
    let rawY = pointer.y * (1 - blend) + idleY * blend;

    // Inclinación del móvil: desplaza el objetivo. Es el único mando que hay
    // cuando no se toca la pantalla, así que aquí sí conviene que empuje.
    const gyroEase = 1 - Math.pow(0.25, delta);
    gyro.x += (gyro.rawX - gyro.x) * gyroEase;
    gyro.y += (gyro.rawY - gyro.y) * gyroEase;

    // Si la cadena persigue un punto que cae fuera, los doce eslabones se
    // amontonan contra la pared y se quedan ahí pegados.
    // En fracción del ancho, no fijo: en vertical, 0.12 a cada lado se comía
    // más de la mitad del encuadre y dejaba la masa sin sitio a donde ir.
    const edge = Math.min(0.12, aspect * 0.16);
    rawX = Math.min(Math.max(rawX, edge), aspect - edge);
    rawY = Math.min(Math.max(rawY, edge), 1 - edge);

    // El empuje del texto entra ANTES del suavizado, no después: sumándolo
    // al final, al entrar en la zona el objetivo pegaba un respingo hacia
    // arriba que la cadena copiaba tal cual.
    rawY += textLift(rawX, rawY);

    // --- Inclinación ---
    //
    // Inclinar no mueve un punto de destino al que la masa persigue: desplaza
    // el sitio donde el agua quiere estar, y la masa va hasta allí con su
    // inercia. La diferencia se nota al enderezar el móvil, que es cuando
    // vuelve pasándose de largo.
    //
    // El alcance se mide contra el hueco que hay de verdad hasta la pared, no
    // en unidades fijas. Pidiendo más de lo que cabe, el recorte contra el
    // borde se comía la mitad del gesto: seguías inclinando y ya no pasaba
    // nada, que es lo que hacía que no se entendiera el mando.
    const reachX = Math.max(aspect * 0.5 - edge, 0.05);
    const reachY = Math.max(0.5 - edge, 0.05) * 0.62;

    const spring = POOL_RESPONSE * POOL_RESPONSE;
    const poolDrag = Math.exp(-2 * POOL_DAMPING * POOL_RESPONSE * delta);
    pool.vx += (gyro.x * reachX - pool.x) * spring * delta;
    pool.vy += (gyro.y * reachY - pool.y) * spring * delta;
    pool.vx *= poolDrag;
    pool.vy *= poolDrag;
    pool.x += pool.vx * delta;
    pool.y += pool.vy * delta;

    // Y el objetivo de verdad va por detrás del crudo.
    //
    // El crudo pega saltos: al volver a mover el ratón después de un rato
    // parado salta del paseo autónomo hasta el cursor, y un manotazo con el
    // ratón lo teletransporta. Cada salto llegaba entero a la cabeza de la
    // cadena. Con esta etapa de retardo el objetivo no puede saltar, solo
    // acelerar, y los tropezones desaparecen.
    const aimEase = 1 - Math.pow(0.002, delta);
    aim.x += (rawX - aim.x) * aimEase;
    aim.y += (rawY - aim.y) * aimEase;

    // El charco se suma DESPUÉS del suavizado y se recorta al final: si se
    // sumara antes, el recorte contra el borde se comería el bamboleo justo
    // cuando la masa llega a la esquina, que es cuando hay que verlo.
    const target = {
      x: Math.min(Math.max(aim.x + pool.x, edge), aspect - edge),
      y: Math.min(Math.max(aim.y + pool.y, edge), 1 - edge),
    };

    // El sitio al que tiran las gotas sueltas se corre con el charco: el
    // mismo desplazamiento que lleva la cadena.
    //
    // Antes cada gota recibía su propio empujón hacia el lado bajo, y la masa
    // se deshacía en cuentas separadas: vistoso un segundo, pero deja de
    // parecer líquido. Moviendo su centro en vez de empujarlas una a una, la
    // masa entera se desplaza conservando su forma, y el vaivén se lo pone el
    // muelle del charco.
    const centre = aspect * MASS_BIAS_X + pool.x;

    for (let index = 0; index < blobs.length; index += 1) {
      const blob = blobs[index]!;

      if (index < STREAM) {
        // Cadena: la primera persigue el objetivo, cada una a la anterior.
        // El retardo creciente es lo que estira el chorro.
        const lead = index === 0 ? target : blobs[index - 1]!;

        // Seguimiento por suavizado, no por muelle.
        //
        // Un muelle poco amortiguado se pasa de largo y rebota, y con el
        // cursor encima de la masa eso se convertía en un latigazo. Aquí la
        // gota solo recorre una fracción fija de lo que le falta para llegar
        // a su guía: no acumula velocidad, no puede dispararse. El rastro
        // sigue siendo largo, pero por el retardo acumulado de los doce
        // eslabones, no por inercia.
        //
        // La fracción se calcula por segundo, no por fotograma: si no, en una
        // pantalla de 120 Hz el rastro se recogería al doble de rápido que en
        // una de 60 y el efecto cambiaría de un equipo a otro.
        // Y la cadena es una cuerda, no un imán: cada eslabón persigue un
        // punto a una distancia fija POR DETRÁS del anterior. Y "detrás" es
        // respecto a hacia dónde IBA el anterior, no respecto a la línea que
        // los une: tomando la línea, la cadena se enrollaba sobre sí misma y
        // acababa siendo una bola pegada al cursor. Con la dirección de
        // marcha se tiende a lo largo del recorrido, que es lo que se espera
        // de un rastro.
        let goalX = lead.x;
        let goalY = lead.y;
        if (index > 0) {
          const previous = blobs[index - 1]!;
          const link = blob.radius * 1.4;
          goalX = Math.min(Math.max(previous.x - previous.dirX * link, edge), aspect - edge);
          goalY = Math.min(Math.max(previous.y - previous.dirY * link, edge), 1 - edge);
          // El eslabón también esquiva el texto, cada uno por su cuenta: así
          // la cinta se arquea por encima del bloque en vez de subir entera
          // de golpe.
          goalY += textLift(goalX, goalY);
        }

        const settle = index === 0 ? 0.015 : 0.1;
        const follow = (1 - Math.pow(settle, delta)) / delta;
        blob.vx = (goalX - blob.x) * follow;
        blob.vy = (goalY - blob.y) * follow;

        // Un empujón del campo turbulento, flojo: es lo que hace serpentear
        // la cinta en vez de dejarla como un churro recto cuando se para.
        const [sx, sy] = curl(blob.x * 1.6 + blob.seed, blob.y * 1.6, time * 0.4);
        blob.vx += sx * 0.14;
        blob.vy += sy * 0.14;
      } else {
        // Turbulencia: el campo curl las arrastra en remolinos.
        const [cx, cy] = curl(blob.x * 1.9 + blob.seed, blob.y * 1.9, time * 0.55);
        blob.vx += (cx * 0.5 * delta) / blob.drag;
        blob.vy += (cy * 0.5 * delta) / blob.drag;

        // Atracción floja a un centro desplazado hacia arriba: si no, el
        // campo las acaba echando fuera. Se afloja al inclinar el móvil.
        blob.vx += (centre - blob.x) * 0.55 * delta;
        blob.vy += (0.62 + pool.y - blob.y) * 0.75 * delta;


        // Y el empuje del texto, aquí sí como fuerza: estas gotas sí
        // acumulan velocidad, al contrario que las de la cadena.
        blob.vy += textLift(blob.x, blob.y) * 5 * delta;

        // Empuje del cursor: al pasar, aparta un poco las gotas cercanas.
        //
        // La caída es cuadrática y no lineal: con caída lineal el empuje
        // seguía siendo fuerte justo en el borde del radio de acción, y al
        // entrar y salir de él las gotas pegaban tirones. Así llega a cero
        // suavemente.
        const dx = blob.x - target.x;
        const dy = blob.y - target.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < 0.12 && dist2 > 0.0004) {
          const falloff = (1 - dist2 / 0.12) ** 2;
          const force = falloff * 2.4 * (0.3 + pointer.speed);
          const inv = 1 / Math.sqrt(dist2);
          blob.vx += dx * inv * force * delta;
          blob.vy += dy * inv * force * delta;
        }

        const ambientFriction = Math.pow(0.22, delta);
        blob.vx *= ambientFriction;
        blob.vy *= ambientFriction;
      }

      blob.x += blob.vx * delta;
      blob.y += blob.vy * delta;

      // Muros blandos.
      //
      // Invertir la velocidad al tocar el borde es un tirón seco, y en una
      // pantalla estrecha las gotas tocan borde continuamente: de ahí los
      // tropezones. Aquí el borde empuja hacia dentro con una fuerza
      // proporcional a lo que se ha salido, y frena SOLO mientras está
      // fuera. Ese freno es lo que impide que el muelle la devuelva rebotando.
      const pad = blob.radius * 0.55;
      const brake = Math.pow(0.04, delta);
      if (blob.x < pad) {
        blob.vx += (pad - blob.x) * 18 * delta;
        blob.vx *= brake;
      } else if (blob.x > aspect - pad) {
        blob.vx -= (blob.x - aspect + pad) * 18 * delta;
        blob.vx *= brake;
      }
      if (blob.y < pad) {
        blob.vy += (pad - blob.y) * 18 * delta;
        blob.vy *= brake;
      } else if (blob.y > 1 - pad) {
        blob.vy -= (blob.y - 1 + pad) * 18 * delta;
        blob.vy *= brake;
      }

      const offset = index * 4;
      blobData[offset] = blob.x;
      blobData[offset + 1] = blob.y;
      blobData[offset + 2] = blob.radius;
      blobData[offset + 3] = blob.weight;
      // Dirección propia: apunta a donde va la gota y se queda apuntando
      // cuando se para. La cadena se apoya en ella para tenderse a lo largo
      // del recorrido en vez de enrollarse sobre sí misma.
      const speed = Math.hypot(blob.vx, blob.vy);
      if (speed > 0.03) {
        const turn = 1 - Math.pow(0.05, delta);
        blob.dirX += (blob.vx / speed - blob.dirX) * turn;
        blob.dirY += (blob.vy / speed - blob.dirY) * turn;
        const len = Math.hypot(blob.dirX, blob.dirY) || 1;
        blob.dirX /= len;
        blob.dirY /= len;
      }

      velData[offset] = blob.vx;
      velData[offset + 1] = blob.vy;
    }

    // La velocidad del cursor decae sola: si no, un movimiento brusco dejaría
    // el empuje activado para siempre.
    pointer.speed *= Math.pow(0.02, delta);
  }

  function render(time: number, delta: number) {
    // --- Huella del cursor: se lee la del fotograma anterior y se escribe
    // en la otra textura ---
    const nextFlow = 1 - flowIndex;
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, flowBuffers[nextFlow]!);
    gl!.viewport(0, 0, flowWidth, flowHeight);
    gl!.useProgram(flowProgram);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, flowTextures[flowIndex]!);
    gl!.uniform1i(flowUniforms.get('uPrev')!, 0);
    gl!.uniform2f(flowUniforms.get('uMouse')!, pointer.x, pointer.y);
    gl!.uniform2f(flowUniforms.get('uVelocity')!, pointerDelta.x, pointerDelta.y);
    gl!.uniform1f(flowUniforms.get('uAspect')!, aspect);
    gl!.uniform1f(flowUniforms.get('uRadius')!, FLOW_RADIUS);
    // El desvanecimiento va por segundo, no por fotograma: si no, la huella
    // duraría la mitad en una pantalla de 120 Hz que en una de 60.
    gl!.uniform1f(flowUniforms.get('uDecay')!, Math.pow(FLOW_DECAY, delta));
    gl!.bindVertexArray(vao);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);

    flowIndex = nextFlow;
    pointerDelta.x = 0;
    pointerDelta.y = 0;

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

    gl!.activeTexture(gl!.TEXTURE2);
    gl!.bindTexture(gl!.TEXTURE_2D, flowTextures[flowIndex]!);
    gl!.uniform1i(liquidUniforms.get('uFlow')!, 2);

    gl!.uniform2f(liquidUniforms.get('uResolution')!, canvas.width, canvas.height);
    gl!.uniform1f(liquidUniforms.get('uTime')!, time);
    gl!.uniform1f(liquidUniforms.get('uThreshold')!, 0.52);
    gl!.uniform1f(liquidUniforms.get('uEdge')!, 0.5);
    // Fuerte: el humo del fondo se retuerce de verdad al pasar el líquido.
    // Al texto solo le llega una fracción (TEXT_REFRACT en el shader), que es
    // lo que le deja seguir leyéndose por debajo.
    gl!.uniform1f(liquidUniforms.get('uRefract')!, 0.058);
    // La dispersión se muestrea en seis bandas, así que si se sube demasiado
    // las bandas dejan de solaparse y en vez de arcoíris salen seis fantasmas
    // de colores sobre cada letra. A 0.32 el abanico sigue siendo continuo.
    gl!.uniform1f(liquidUniforms.get('uDispersion')!, 0.32);
    gl!.uniform2f(liquidUniforms.get('uTilt')!, tilt.x, tilt.y);
    gl!.uniform1f(liquidUniforms.get('uAberration')!, 0.0034);
    gl!.uniform1f(liquidUniforms.get('uIridescence')!, 0.16);
    gl!.uniform1f(liquidUniforms.get('uFlowStrength')!, 0.85);
    gl!.uniform4fv(liquidUniforms.get('uBigBox')!, bigTextBox);
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
    render(elapsed, delta);
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

    pointerDelta.x += nx - pointer.x;
    pointerDelta.y += ny - pointer.y;

    // La velocidad alimenta el empuje que salpica las gotas cercanas.
    pointer.speed = Math.min(Math.hypot(nx - pointer.x, ny - pointer.y) * 14, 1.4);
    pointer.x = nx;
    pointer.y = ny;
    pointer.lastMove = elapsed;
  }

  /**
   * Giroscopio. Solo en pantallas táctiles, y muy suave.
   *
   * La primera lectura fija el cero, así que da igual cómo se sujete el
   * móvil: lo que mueve la masa es el cambio respecto a esa postura, no la
   * inclinación absoluta. Sin eso, mirándolo tumbado en el sofá la masa se
   * iría a un lado y se quedaría ahí.
   */
  function readTilt(across: number, along: number) {
    gyro.live = true;
    if (!gyro.base) gyro.base = [along, across];
    const [baseAlong, baseAcross] = gyro.base;
    // Doce grados de recorrido hasta el tope, pero con la curva expandida
    // cerca del cero: a un tercio de la inclinación le corresponde la mitad
    // del recorrido. Girar mucho el móvil no es una opción —a los pocos
    // grados la pantalla se pone horizontal— así que lo que tiene que rendir
    // es el gesto pequeño.
    const curve = (degrees: number) => {
      const t = Math.min(Math.max(degrees / 12, -1), 1);
      return Math.sign(t) * Math.abs(t) ** 0.65;
    };
    gyro.rawX = curve(across - baseAcross);
    gyro.rawY = curve(along - baseAlong);
  }

  function onOrientation(event: DeviceOrientationEvent) {
    const { beta, gamma } = event;
    if (beta === null || gamma === null) return;
    gyro.source = 'orientation';
    readTilt(gamma, beta);
  }

  /**
   * Respaldo por acelerómetro.
   *
   * Hay móviles que no emiten deviceorientation y sí devicemotion, y el
   * vector de la gravedad dice la inclinación igual de bien: cuánta gravedad
   * cae sobre el eje X es cuánto está ladeado el aparato. Se convierte a
   * grados para que comparta el mismo recorrido que la otra fuente.
   */
  function onMotion(event: DeviceMotionEvent) {
    // Si la orientación ya está informando, esta se aparta.
    if (gyro.source === 'orientation') return;
    const gravity = event.accelerationIncludingGravity;
    if (!gravity || gravity.x === null || gravity.y === null) return;
    gyro.source = 'motion';
    readTilt((-gravity.x / 9.81) * 45, (gravity.y / 9.81) * 45);
  }

  let stopOrientation = () => {};

  if (
    !options.reducedMotion &&
    (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0)
  ) {
    // Se escucha desde el principio y sin condiciones.
    //
    // Escuchar sin permiso no cuesta nada: si no lo hay, sencillamente no
    // llega ningún evento, y en cuanto se concede empiezan a llegar a un
    // oyente que ya estaba puesto. Antes esperaba a que requestPermission
    // contestara 'granted' para engancharse, y ahí estaba el fallo: hay
    // navegadores que contestan 'prompt', que no es una negativa, y el
    // sensor se quedaba sin nadie escuchando para siempre.
    //
    // Se escuchan tres canales porque no todos los aparatos emiten los
    // mismos, y manda el primero que informe.
    window.addEventListener('deviceorientation', onOrientation);
    window.addEventListener('deviceorientationabsolute', onOrientation);
    window.addEventListener('devicemotion', onMotion);

    type Gated = { requestPermission?: () => Promise<string> };
    const apis = [
      typeof DeviceOrientationEvent === 'undefined' ? undefined : (DeviceOrientationEvent as unknown as Gated),
      typeof DeviceMotionEvent === 'undefined' ? undefined : (DeviceMotionEvent as unknown as Gated),
    ];

    // Y aparte se pide el permiso, que en iOS solo se concede dentro de un
    // gesto del usuario. Se escuchan tres tipos de gesto porque según se
    // toque o se arrastre no siempre llega el mismo.
    // Solo touchend y click.
    //
    // WebKit no considera pointerdown un gesto válido para pedir el sensor:
    // contesta "requires a user gesture to prompt" y no llega a enseñar la
    // ventana. Como pointerdown se dispara ANTES que touchend, bastaba con
    // tenerlo en la lista para que se llevara el único intento.
    const gestures = ['touchend', 'click'];

    /**
     * Se cuenta a quien quiera oírlo qué ha contestado el permiso.
     *
     * Es para que la pantalla de diagnóstico pueda informar del resultado sin
     * volver a pedirlo por su cuenta: dos peticiones a la vez y iOS deniega
     * la segunda, con lo que el diagnóstico acusaba al móvil de un problema
     * que causaba él mismo.
     */
    const announce = (state: string) => {
      window.dispatchEvent(new CustomEvent('hero:sensor', { detail: state }));
    };

    // Y no se deja de escuchar hasta que haya una respuesta de verdad.
    //
    // Antes se soltaban los oyentes al primer gesto, hubiera contestado o no.
    // Si ese intento fallaba —porque el gesto no valía, o porque el usuario
    // descartó la ventana— ya no había segunda oportunidad en toda la sesión.
    let settled = false;
    const detach = () => {
      gestures.forEach((name) => window.removeEventListener(name, unlock));
    };

    function unlock() {
      if (settled) return;
      let asked = false;
      apis.forEach((api) => {
        if (typeof api?.requestPermission !== 'function') return;
        asked = true;
        api
          .requestPermission()
          .then((state) => {
            settled = true;
            detach();
            announce(state);
          })
          // Sin soltar los oyentes: al próximo toque se vuelve a intentar.
          .catch((error: Error) => announce(`reintentando (${error.message})`));
      });
      if (!asked) {
        settled = true;
        detach();
        announce('no hace falta');
      }
    }

    if (apis.some((api) => typeof api?.requestPermission === 'function')) {
      gestures.forEach((name) => window.addEventListener(name, unlock));
    }

    stopOrientation = () => {
      window.removeEventListener('deviceorientation', onOrientation);
      window.removeEventListener('deviceorientationabsolute', onOrientation);
      window.removeEventListener('devicemotion', onMotion);
      detach();
    };
  }

  const resizeObserver = new ResizeObserver(() => {
    resize();
    if (!running) {
      step(elapsed, 1 / 60);
      render(elapsed, 1 / 60);
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
  render(0, 1 / 60);

  return {
    setMarks(index: number) {
      marksIndex = Math.min(Math.max(index, 0), MARK_PRESETS.length - 1);
      drawText();
      if (!running) render(elapsed, 1 / 60);
    },
    destroy() {
      stop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onPointerMove);
      stopOrientation();
      gl!.deleteProgram(smokeProgram);
      gl!.deleteProgram(liquidProgram);
      gl!.deleteProgram(flowProgram);
      gl!.deleteTexture(smokeTexture);
      gl!.deleteTexture(textTexture);
      flowTextures.forEach((texture) => gl!.deleteTexture(texture));
      flowBuffers.forEach((buffer) => gl!.deleteFramebuffer(buffer));
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
