/**
 * El dorso de la tarjeta de visita, como el hero: el mismo humo y unas
 * pocas pompas del mismo líquido.
 *
 * Se pinta en DOS lienzos, uno por debajo de los datos y otro por encima:
 *
 * - fondo: el humo y, dentro de las pompas, el humo refractado en seis
 *   longitudes de onda más el cuerpo de la lámina de agua. Es opaco.
 * - brillo: solo los reflejos (especular, sheen, Fresnel e iridiscencia),
 *   con transparencia. Va encima de los datos, así las pompas pasan por
 *   encima de la información sin taparla ni quitarle los clics.
 *
 * El campo de gotas, la normal y la luz son los del shader LIQUID del
 * hero, con sus mismos valores; aquí no hay texto en la textura, ni
 * huella del cursor, ni alejamiento.
 */
import { SMOKE, VERTEX } from './shaders';

/** Pocas pompas: es un adorno, no la masa del hero. */
const GOTAS = 7;
/** El humo, a media resolución: es de frecuencia baja y no se nota. */
const ESCALA_HUMO = 0.5;
const MAX_DPR = 2;

/** El cálculo del campo y su gradiente, igual que en LIQUID. */
const CAMPO = /* glsl */ `
uniform vec4 uBlobs[${GOTAS}];
uniform vec4 uBlobVel[${GOTAS}];
uniform vec2 uResolution;
uniform float uThreshold;
uniform float uEdge;

const float K = 2.6;

vec3 spectrum(float t) {
  return 0.5 + 0.5 * cos(6.2831853 * (t + vec3(0.0, -0.3333333, 0.3333333)));
}

void campo(vec2 p, out float field, out vec2 grad) {
  field = 0.0;
  grad = vec2(0.0);
  for (int i = 0; i < ${GOTAS}; i++) {
    vec4 b = uBlobs[i];
    if (b.z <= 0.0001) continue;
    vec2 d = p - b.xy;
    vec2 v = uBlobVel[i].xy;
    float speed = length(v);
    vec2 dir = speed > 0.0001 ? v / speed : vec2(1.0, 0.0);
    vec2 perp = vec2(-dir.y, dir.x);
    float invStretch = 1.0 / (1.0 + speed * 5.5);
    vec2 local = vec2(dot(d, dir) * invStretch, dot(d, perp));
    float r2 = dot(local, local) / (b.z * b.z);
    if (r2 > 6.5) continue;
    float g = b.w * exp(-K * r2);
    field += g;
    vec2 gradLocal = (-2.0 * K / (b.z * b.z)) * g * local;
    grad += gradLocal.x * dir * invStretch + gradLocal.y * perp;
  }
}
`;

/** Lienzo de abajo: humo, y humo refractado dentro de las pompas. */
const FONDO = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uSmoke;
uniform float uRefract;
uniform float uDispersion;
${CAMPO}

void main() {
  float aspect = uResolution.x / uResolution.y;
  vec2 p = vec2(vUv.x * aspect, vUv.y);
  float field;
  vec2 grad;
  campo(p, field, grad);

  vec3 humo = texture(uSmoke, vUv).rgb;
  float mask = smoothstep(uThreshold, uThreshold + uEdge, field);
  if (mask <= 0.001) {
    fragColor = vec4(humo, 1.0);
    return;
  }

  vec3 normal = normalize(vec3(-grad * 0.13, 1.0));
  float thickness = smoothstep(uThreshold, uThreshold + uEdge * 2.4, field);
  float edgeBoost = 1.0 - abs(thickness * 2.0 - 1.0);
  vec2 offset = normal.xy * uRefract * (0.2 + edgeBoost);

  // Dispersión espectral: seis bandas, cada una con su índice.
  vec3 refracted = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    float t = (float(i) + 0.5) / 6.0;
    float ior = 1.0 + (t - 0.5) * uDispersion;
    refracted += spectrum(t) * texture(uSmoke, vUv - offset * ior).rgb;
  }
  refracted /= 3.0;

  // El cuerpo de la lámina de agua.
  vec3 colour = refracted + vec3(0.055) * thickness;
  fragColor = vec4(mix(humo, colour, mask), 1.0);
}`;

/** Lienzo de arriba: solo los reflejos, con alfa premultiplicado. */
const BRILLO = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform float uIridescence;
${CAMPO}

void main() {
  float aspect = uResolution.x / uResolution.y;
  vec2 p = vec2(vUv.x * aspect, vUv.y);
  float field;
  vec2 grad;
  campo(p, field, grad);

  float mask = smoothstep(uThreshold, uThreshold + uEdge, field);
  if (mask <= 0.001) {
    fragColor = vec4(0.0);
    return;
  }

  vec3 normal = normalize(vec3(-grad * 0.13, 1.0));
  float thickness = smoothstep(uThreshold, uThreshold + uEdge * 2.4, field);
  float edgeBoost = 1.0 - abs(thickness * 2.0 - 1.0);

  // La misma luz que el hero: alta y a la izquierda.
  vec3 lightDir = normalize(vec3(-0.35, 0.72, 0.6));
  vec3 halfVec = normalize(lightDir + vec3(0.0, 0.0, 1.0));
  float specular = pow(max(dot(normal, halfVec), 0.0), 74.0);
  float sheen = pow(max(dot(normal, halfVec), 0.0), 9.0) * 0.16;
  float fresnel = pow(1.0 - max(normal.z, 0.0), 2.6);
  vec3 film = spectrum(fract(thickness * 1.9 + fresnel * 1.1 + 0.12));

  vec3 luz = vec3(specular) * 1.7 + vec3(sheen) + vec3(fresnel) * 0.24
    + film * uIridescence * edgeBoost * (0.35 + fresnel);
  luz *= mask;
  // Se suma como luz: el alfa es lo más brillante de los tres canales.
  float a = clamp(max(luz.r, max(luz.g, luz.b)), 0.0, 1.0);
  fragColor = vec4(min(luz, vec3(a)), a);
}`;

interface Gota {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radio: number;
  /** Centro y amplitud del paseo, en unidades de alto. */
  cx: number;
  cy: number;
  ax: number;
  ay: number;
  /** Periodos en segundos y desfase. */
  px: number;
  py: number;
  fase: number;
}

export interface LiquidoTarjeta {
  /** Arranca o para la animación (solo con el dorso a la vista). */
  activar(si: boolean): void;
  /** Posición del ratón en el dorso, de 0 a 1; null al salir. */
  raton(x: number | null, y: number): void;
}

function programa(gl: WebGL2RenderingContext, fragmentos: string) {
  const compilar = (tipo: number, fuente: string) => {
    const s = gl.createShader(tipo)!;
    gl.shaderSource(s, fuente);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, compilar(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(p, compilar(gl.FRAGMENT_SHADER, fragmentos));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
  return p;
}

export function crearLiquidoTarjeta(lienzoFondo: HTMLCanvasElement, lienzoBrillo: HTMLCanvasElement): LiquidoTarjeta | null {
  const gl = lienzoFondo.getContext('webgl2', { antialias: false, alpha: false });
  const gb = lienzoBrillo.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: true });
  if (!gl || !gb) return null;

  // ── Lienzo de abajo: humo en una textura y líquido encima ──
  const progHumo = programa(gl, SMOKE);
  const progFondo = programa(gl, FONDO);
  const vaoFondo = gl.createVertexArray();
  const texHumo = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texHumo);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbHumo = gl.createFramebuffer()!;

  // ── Lienzo de arriba: solo los brillos ──
  const progBrillo = programa(gb, BRILLO);
  const vaoBrillo = gb.createVertexArray();

  const u = (g: WebGL2RenderingContext, p: WebGLProgram, n: string) => g.getUniformLocation(p, n);

  /*
    Las pompas. Las unidades son las del shader: el alto mide 1 y el ancho
    lo que dé la proporción. Cada una se pasea alrededor de su sitio con
    periodos distintos, así a ratos se acercan y se funden. Tamaños
    mezclados, como en el hero: un par grandes y gotas pequeñas. Con el
    umbral del hero, una gota se ve hasta la mitad de su radio.
  */
  const gotas: Gota[] = [
    { cx: 1.18, cy: 0.74, ax: 0.1, ay: 0.06, px: 13, py: 10, fase: 0, radio: 0.34 },
    { cx: 1.4, cy: 0.62, ax: 0.07, ay: 0.08, px: 11, py: 15, fase: 1.3, radio: 0.21 },
    { cx: 1.02, cy: 0.82, ax: 0.09, ay: 0.05, px: 17, py: 12, fase: 2.1, radio: 0.13 },
    { cx: 0.36, cy: 0.18, ax: 0.08, ay: 0.05, px: 15, py: 11, fase: 0.6, radio: 0.24 },
    { cx: 0.55, cy: 0.24, ax: 0.07, ay: 0.06, px: 10, py: 14, fase: 3.4, radio: 0.14 },
    { cx: 0.86, cy: 0.42, ax: 0.16, ay: 0.08, px: 19, py: 16, fase: 4.2, radio: 0.16 },
    { cx: 1.5, cy: 0.2, ax: 0.06, ay: 0.06, px: 12, py: 9, fase: 5.1, radio: 0.11 },
  ].map((g) => ({ ...g, x: g.cx, y: g.cy, vx: 0, vy: 0 }));

  const datosGotas = new Float32Array(GOTAS * 4);
  const datosVel = new Float32Array(GOTAS * 4);
  const cursor = { x: 0, y: 0, dentro: false };

  let ancho = 1;
  let alto = 1;
  let proporcion = 1.75;

  const medir = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    ancho = Math.max(1, Math.round(lienzoFondo.clientWidth * dpr));
    alto = Math.max(1, Math.round(lienzoFondo.clientHeight * dpr));
    proporcion = ancho / alto;
    lienzoFondo.width = lienzoBrillo.width = ancho;
    lienzoFondo.height = lienzoBrillo.height = alto;
    gl.bindTexture(gl.TEXTURE_2D, texHumo);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      Math.max(1, Math.round(ancho * ESCALA_HUMO)),
      Math.max(1, Math.round(alto * ESCALA_HUMO)),
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbHumo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texHumo, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  /** Mueve las pompas: persiguen su paseo con inercia; el ratón las aparta un poco. */
  const mover = (t: number, dt: number) => {
    const escala = proporcion / 1.75;
    gotas.forEach((g, i) => {
      const dx = g.cx * escala + Math.sin((t / g.px) * Math.PI * 2 + g.fase) * g.ax;
      const dy = g.cy + Math.cos((t / g.py) * Math.PI * 2 + g.fase) * g.ay;
      let fx = (dx - g.x) * 0.9;
      let fy = (dy - g.y) * 0.9;
      if (cursor.dentro) {
        const ex = g.x - cursor.x;
        const ey = g.y - cursor.y;
        const d2 = ex * ex + ey * ey;
        const empuje = Math.exp(-d2 / 0.03) * 2.2;
        fx += ex * empuje;
        fy += ey * empuje;
      }
      g.vx = (g.vx + fx * dt) * Math.pow(0.9, dt * 60);
      g.vy = (g.vy + fy * dt) * Math.pow(0.9, dt * 60);
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      datosGotas.set([g.x, g.y, g.radio, 1], i * 4);
      // La velocidad estira la gota: se escala para que se note un pelo.
      datosVel.set([g.vx * 3, g.vy * 3, 0, 0], i * 4);
    });
  };

  const pintar = (t: number) => {
    // Humo a media resolución.
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbHumo);
    gl.viewport(0, 0, Math.round(ancho * ESCALA_HUMO), Math.round(alto * ESCALA_HUMO));
    gl.useProgram(progHumo);
    gl.uniform2f(u(gl, progHumo, 'uResolution'), ancho * ESCALA_HUMO, alto * ESCALA_HUMO);
    gl.uniform1f(u(gl, progHumo, 'uTime'), t);
    gl.bindVertexArray(vaoFondo);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Humo y refracción, a tamaño completo.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, ancho, alto);
    gl.useProgram(progFondo);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texHumo);
    gl.uniform1i(u(gl, progFondo, 'uSmoke'), 0);
    gl.uniform2f(u(gl, progFondo, 'uResolution'), ancho, alto);
    gl.uniform1f(u(gl, progFondo, 'uThreshold'), 0.52);
    gl.uniform1f(u(gl, progFondo, 'uEdge'), 0.5);
    gl.uniform1f(u(gl, progFondo, 'uRefract'), 0.058);
    gl.uniform1f(u(gl, progFondo, 'uDispersion'), 0.32);
    gl.uniform4fv(u(gl, progFondo, 'uBlobs'), datosGotas);
    gl.uniform4fv(u(gl, progFondo, 'uBlobVel'), datosVel);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Los brillos, encima de los datos.
    gb.viewport(0, 0, ancho, alto);
    gb.clearColor(0, 0, 0, 0);
    gb.clear(gb.COLOR_BUFFER_BIT);
    gb.useProgram(progBrillo);
    gb.uniform2f(u(gb, progBrillo, 'uResolution'), ancho, alto);
    gb.uniform1f(u(gb, progBrillo, 'uThreshold'), 0.52);
    gb.uniform1f(u(gb, progBrillo, 'uEdge'), 0.5);
    gb.uniform1f(u(gb, progBrillo, 'uIridescence'), 0.16);
    gb.uniform4fv(u(gb, progBrillo, 'uBlobs'), datosGotas);
    gb.uniform4fv(u(gb, progBrillo, 'uBlobVel'), datosVel);
    gb.bindVertexArray(vaoBrillo);
    gb.drawArrays(gb.TRIANGLES, 0, 3);
  };

  const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const inicio = performance.now();
  let bucle = 0;
  let anterior = 0;

  const paso = (ahora: number) => {
    const dt = anterior ? Math.min((ahora - anterior) / 1000, 0.05) : 1 / 60;
    anterior = ahora;
    const t = (ahora - inicio) / 1000;
    mover(t, dt);
    pintar(t);
    bucle = requestAnimationFrame(paso);
  };

  medir();
  mover(0, 0);
  // Las pompas empiezan ya en su sitio, sin llegar volando.
  gotas.forEach((g) => {
    g.x = g.cx * (proporcion / 1.75);
    g.y = g.cy;
  });
  mover(0, 0);
  pintar(0);
  new ResizeObserver(() => {
    medir();
    pintar((performance.now() - inicio) / 1000);
  }).observe(lienzoFondo);

  return {
    activar(si) {
      if (si && !bucle && !quieto) {
        anterior = 0;
        bucle = requestAnimationFrame(paso);
      } else if (!si && bucle) {
        cancelAnimationFrame(bucle);
        bucle = 0;
      }
    },
    raton(x, y) {
      if (x === null) {
        cursor.dentro = false;
        return;
      }
      cursor.dentro = true;
      cursor.x = x * proporcion;
      // Llega con el 0 arriba, como en la pantalla; el shader cuenta desde abajo.
      cursor.y = 1 - y;
    },
  };
}
