/** Triángulo a pantalla completa: más barato que dos triángulos de un quad. */
export const VERTEX = /* glsl */ `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * Pasada 1 — el humo.
 *
 * Son unas 30 evaluaciones de ruido por píxel, así que se pinta a media
 * resolución en una textura. Es de frecuencia baja: al ampliarla no se nota,
 * y evita recalcularla las tres veces que la muestrea la refracción.
 */
export const SMOKE = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uResolution;
uniform float uTime;

// Ruido de valor con hash entero: determinista y sin texturas auxiliares.
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 6; i++) {
    sum += amp * noise(p);
    p = p * 2.02 + vec2(11.3, 7.7);
    amp *= 0.5;
  }
  return sum;
}

void main() {
  vec2 uv = vUv;
  vec2 p = uv * vec2(uResolution.x / uResolution.y, 1.0);

  // Deformación del dominio: el ruido se alimenta de otro ruido. Es lo que
  // convierte una nube uniforme en humo con volutas y hebras.
  float t = uTime * 0.02;
  vec2 warp = vec2(
    fbm(p * 1.6 + vec2(0.0, t)),
    fbm(p * 1.6 + vec2(5.2, 1.3 - t))
  );
  vec2 warp2 = vec2(
    fbm(p * 2.4 + warp * 2.4 + vec2(1.7, 9.2)),
    fbm(p * 2.4 + warp * 2.4 + vec2(8.3, 2.8))
  );
  float smoke = fbm(p * 2.2 + warp2 * 2.2 + vec2(0.0, t * 1.6));

  // Contraste alto y sesgo a oscuro: la referencia es casi negra con crestas
  // muy blancas, no un gris plano.
  smoke = pow(clamp(smoke, 0.0, 1.0), 2.35);
  smoke = smoothstep(0.02, 0.85, smoke);

  // Viñeteado: empuja la atención al centro y oscurece las esquinas.
  float vignette = smoothstep(1.25, 0.25, length(uv - 0.5) * 1.6);

  vec3 colour = vec3(smoke * 0.92) * vignette;
  colour += vec3(0.015);

  fragColor = vec4(colour, 1.0);
}`;

/**
 * Pasada 2 — el líquido.
 *
 * El campo de metaballs y su gradiente se acumulan en el MISMO bucle: la
 * derivada de una gaussiana es analítica, así que no hace falta muestrear
 * píxeles vecinos para sacar la normal. Eso divide el coste entre cinco.
 */
export const LIQUID = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSmoke;
uniform sampler2D uText;
uniform vec2 uResolution;
uniform float uTime;

const int MAX_BLOBS = ${24};

// xy = centro, z = radio, w = peso
uniform vec4 uBlobs[MAX_BLOBS];
// xy = velocidad (estira la gota), z = sin usar, w = sin usar
uniform vec4 uBlobVel[MAX_BLOBS];

uniform float uThreshold;
uniform float uEdge;
uniform float uRefract;
uniform float uDispersion;

const float K = 2.6;

/**
 * La escena que ve el líquido: humo con el texto encima.
 * Se compone aquí y no en una pasada aparte para ahorrar un render completo;
 * lo importante es que el texto entre ANTES de refractar, porque si no el
 * líquido no lo deformaría al pasar por encima.
 */
vec3 scene(vec2 uv) {
  vec3 smoke = texture(uSmoke, uv).rgb;
  vec4 text = texture(uText, vec2(uv.x, 1.0 - uv.y));
  return mix(smoke, text.rgb, text.a);
}

void main() {
  float aspect = uResolution.x / uResolution.y;
  vec2 p = vec2(vUv.x * aspect, vUv.y);

  float field = 0.0;
  vec2 grad = vec2(0.0);

  for (int i = 0; i < MAX_BLOBS; i++) {
    vec4 b = uBlobs[i];
    if (b.z <= 0.0001) continue;

    vec2 d = p - b.xy;

    // La gota se alarga en la dirección en que se mueve, como un chorro.
    vec2 v = uBlobVel[i].xy;
    float speed = length(v);
    vec2 dir = speed > 0.0001 ? v / speed : vec2(1.0, 0.0);
    vec2 perp = vec2(-dir.y, dir.x);
    float invStretch = 1.0 / (1.0 + speed * 5.5);

    vec2 local = vec2(dot(d, dir) * invStretch, dot(d, perp));

    float r2 = dot(local, local) / (b.z * b.z);

    // Corte temprano: más allá de este radio la gaussiana aporta menos de una
    // milésima. Con 24 gotas por píxel, ahorrarse la exponencial importa.
    if (r2 > 6.5) continue;

    float g = b.w * exp(-K * r2);
    field += g;

    // Gradiente en el espacio local y vuelta al espacio de pantalla.
    vec2 gradLocal = (-2.0 * K / (b.z * b.z)) * g * local;
    grad += gradLocal.x * dir * invStretch + gradLocal.y * perp;
  }

  // Máscara del líquido: dentro 1, fuera 0, con un canto suave.
  float mask = smoothstep(uThreshold, uThreshold + uEdge, field);

  if (mask <= 0.001) {
    fragColor = vec4(scene(vUv), 1.0);
    return;
  }

  // Normal de superficie a partir del gradiente del campo.
  vec3 normal = normalize(vec3(-grad * 0.2, 1.0));

  // Grosor: en el centro de la gota es mayor, y el canto es donde más desvía.
  float thickness = smoothstep(uThreshold, uThreshold + uEdge * 2.4, field);
  float edgeBoost = 1.0 - abs(thickness * 2.0 - 1.0);

  vec2 offset = normal.xy * uRefract * (0.35 + edgeBoost);

  // Aberración cromática: cada canal se refracta con un índice distinto.
  // Es el origen de los bordes irisados de la referencia.
  vec3 refracted;
  refracted.r = scene(vUv - offset * (1.0 - uDispersion)).r;
  refracted.g = scene(vUv - offset).g;
  refracted.b = scene(vUv - offset * (1.0 + uDispersion)).b;

  // Reflejo especular: una luz alta a la izquierda, como en la referencia.
  vec3 lightDir = normalize(vec3(-0.35, 0.72, 0.6));
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  vec3 halfVec = normalize(lightDir + viewDir);
  float specular = pow(max(dot(normal, halfVec), 0.0), 68.0);

  // Segundo reflejo, más ancho y tenue: da cuerpo a la gota.
  float sheen = pow(max(dot(normal, halfVec), 0.0), 9.0) * 0.16;

  // Fresnel: el canto brilla más que el centro.
  float fresnel = pow(1.0 - max(normal.z, 0.0), 2.6);

  vec3 colour = refracted;
  colour += vec3(specular) * 1.5;
  colour += vec3(sheen);
  colour += vec3(fresnel) * 0.28;

  // Un punto de color frío en el canto, para que no sea vidrio incoloro.
  colour += vec3(0.16, 0.22, 0.34) * fresnel * edgeBoost;

  fragColor = vec4(mix(scene(vUv), colour, mask), 1.0);
}`;
