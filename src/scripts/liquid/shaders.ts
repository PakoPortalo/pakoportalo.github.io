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
 * Pasada intermedia — el flowmap.
 *
 * Una textura que guarda por dónde ha pasado el cursor y hacia dónde iba.
 * Cada fotograma se lee la del fotograma anterior, se atenúa un poco y se le
 * estampa encima la velocidad actual del ratón con una brocha redonda. El
 * resultado es una huella que se va borrando sola.
 *
 * Es una técnica prestada de los flowmaps de Codrops. La gracia frente a
 * guardar las últimas N posiciones del ratón y sumarlas en el shader es que
 * cuesta lo mismo tenga la huella el largo que tenga: la memoria está en la
 * textura, no en un bucle.
 *
 * Se guarda en RGBA8 con el cero en 0.5 porque la velocidad tiene signo y
 * una textura de bytes no lo tiene. Cuesta precisión, pero evita depender de
 * la extensión de texturas en coma flotante, que no está en todas partes.
 */
export const FLOW = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uPrev;
/** Posición del cursor en UV. */
uniform vec2 uMouse;
/** Cuánto se ha movido desde el fotograma anterior, en UV. */
uniform vec2 uVelocity;
uniform float uAspect;
uniform float uRadius;
/** Cuánto sobrevive la huella este fotograma. Ya viene ajustado al delta. */
uniform float uDecay;

void main() {
  // Desde el rango de la textura (0..1) al de la velocidad (-1..1).
  vec2 flow = texture(uPrev, vUv).xy * 2.0 - 1.0;
  flow *= uDecay;

  // La brocha se mide en espacio de aspecto: si no, sería un óvalo en
  // pantallas anchas.
  vec2 d = (vUv - uMouse) * vec2(uAspect, 1.0);
  flow += uVelocity * exp(-dot(d, d) / (uRadius * uRadius));

  fragColor = vec4(clamp(flow, -1.0, 1.0) * 0.5 + 0.5, 0.0, 1.0);
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
// xy = velocidad (estira la gota), zw sin usar
uniform vec4 uBlobVel[MAX_BLOBS];

uniform float uThreshold;
uniform float uEdge;
uniform float uRefract;
uniform float uDispersion;
/** Inclinación de la escena hacia el cursor. Pequeña, en unidades de UV. */
uniform vec2 uTilt;
/** Aberración cromática de toda la escena, no solo bajo el líquido. */
uniform float uAberration;
/** Cuánta iridiscencia de pompa de jabón se suma en los cantos. */
uniform float uIridescence;

/** Huella del cursor. xy = hacia dónde iba, codificado con el cero en 0.5. */
uniform sampler2D uFlow;
/** Cuánto arrastra esa huella a la masa líquida. */
uniform float uFlowStrength;
/**
 * Caja del título y el subtítulo, en UV: xy esquina inferior izquierda,
 * zw superior derecha. Fuera de ella la aberración se baja mucho.
 */
uniform vec4 uBigBox;

const float K = 2.6;

/** Cuántas bandas de longitud de onda se muestrean al refractar. */
const int SPECTRAL = 6;

/**
 * Paleta coseno: tres lóbulos desfasados un tercio de ciclo. Recorriendo t
 * de 0 a 1 se da una vuelta completa al círculo cromático, y —esto es lo
 * importante— seis muestras repartidas por el ciclo suman exactamente 3.0 en
 * cada canal. Es lo que permite descomponer la escena en bandas de color y
 * recomponerla sin teñirla.
 */
vec3 spectrum(float t) {
  return 0.5 + 0.5 * cos(6.2831853 * (t + vec3(0.0, -0.3333333, 0.3333333)));
}

/**
 * Inclina una capa hacia el cursor.
 *
 * Dividir por w es exactamente lo que hace la perspectiva: el lado con w < 1
 * se agranda (se acerca) y el contrario se encoge. Como cada capa usa una
 * profundidad distinta, el humo y el texto se desplazan en distinta medida y
 * aparece el paralaje. No se puede hacer con un transform de CSS porque el
 * texto vive dentro de la textura, no en el DOM.
 */
vec2 tilt(vec2 uv, float depth) {
  vec2 c = uv - 0.5;
  float w = 1.0 + dot(c, uTilt) * depth;
  return c / w + 0.5 - uTilt * depth * 0.02;
}

vec3 smokeAt(vec2 uv) {
  return texture(uSmoke, tilt(uv, 0.4)).rgb;
}

vec4 textAt(vec2 uv) {
  vec2 t = tilt(uv, 1.0);
  return texture(uText, vec2(t.x, 1.0 - t.y));
}

/**
 * Cuánto de la refracción le llega al texto.
 *
 * El humo se deforma a lo bestia y el texto casi nada. No es un truco: en la
 * referencia pasa exactamente eso, y es lo que permite que el líquido cruce
 * por encima del título sin volverlo ilegible. Si ambos se desvían igual, o
 * el fondo queda plano o el nombre se rompe; no hay término medio.
 */
const float TEXT_REFRACT = 0.13;

/**
 * La escena que ve el líquido: humo con el texto encima, cada capa con su
 * propia coordenada. Se compone aquí y no en una pasada aparte para ahorrar
 * un render completo; lo importante es que el texto entre ANTES de refractar,
 * porque si no el líquido no lo deformaría al pasar por encima.
 */
vec3 scene(vec2 uvSmoke, vec2 uvText) {
  vec3 base = smokeAt(uvSmoke);
  vec4 text = textAt(uvText);
  return mix(base, text.rgb, text.a);
}

/**
 * Igual que scene(), pero separando los canales del texto unas milésimas de
 * UV. Da el filo cian/rojo que tienen las letras en toda la pantalla, también
 * lejos del líquido. Cada canal lleva su propio alfa, así que la franja sale
 * en el borde del glifo y no en un rectángulo.
 */
/**
 * Dónde puede pegar fuerte el filo de color.
 *
 * La aberración separa los canales una cantidad fija de píxeles. En un
 * título de 130 px eso es un filo bonito; en un párrafo de 14 px se come la
 * letra. Así que a plena potencia solo dentro de la caja de las dos líneas
 * grandes, con los bordes difuminados para que no se vea el corte.
 */
float aberrationWeight(vec2 uv) {
  vec2 lo = smoothstep(uBigBox.xy - 0.02, uBigBox.xy + 0.02, uv);
  vec2 hi = 1.0 - smoothstep(uBigBox.zw - 0.02, uBigBox.zw + 0.02, uv);
  return lo.x * lo.y * hi.x * hi.y;
}

vec3 sceneAberrated(vec2 uv) {
  vec3 base = smokeAt(uv);
  vec2 shift = (uv - 0.5) * uAberration * mix(0.2, 1.0, aberrationWeight(uv));
  vec4 a = textAt(uv + shift);
  vec4 b = textAt(uv);
  vec4 c = textAt(uv - shift);
  vec3 ink = vec3(a.r * a.a, b.g * b.a, c.b * c.a);
  vec3 cover = vec3(a.a, b.a, c.a);
  return base * (1.0 - cover) + ink;
}

void main() {
  float aspect = uResolution.x / uResolution.y;

  // El campo de metaballs no se evalúa en el píxel, sino un poco más atrás
  // siguiendo la huella del cursor. Eso arrastra la masa hacia donde pasó el
  // ratón y la deja volver cuando la huella se borra.
  //
  // Solo afecta al líquido, y sin necesidad de enmascarar nada: fuera de la
  // masa el campo vale cero, así que desplazar dónde se evalúa no cambia
  // nada. El humo y el texto se muestrean aparte y no se enteran.
  vec2 flow = texture(uFlow, vUv).xy * 2.0 - 1.0;
  vec2 p = vec2(vUv.x * aspect, vUv.y) - flow * uFlowStrength;

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
    fragColor = vec4(sceneAberrated(vUv), 1.0);
    return;
  }

  // Normal de superficie a partir del gradiente del campo. El factor es bajo
  // a propósito: la referencia desvía el texto muy poco y lo deja legible;
  // lo que la hace parecer agua son los brillos, no la deformación.
  vec3 normal = normalize(vec3(-grad * 0.13, 1.0));

  // Grosor: en el centro de la gota es mayor, y el canto es donde más desvía.
  float thickness = smoothstep(uThreshold, uThreshold + uEdge * 2.4, field);
  float edgeBoost = 1.0 - abs(thickness * 2.0 - 1.0);

  // El interior casi no desvía: la lámina de agua es plana ahí. Toda la
  // refracción se concentra en el canto, que es donde la superficie se curva.
  vec2 offset = normal.xy * uRefract * (0.2 + edgeBoost);

  // Dispersión espectral: en vez de separar R, G y B —que da bordes duros de
  // tres colores— se muestrea la escena en seis longitudes de onda, cada una
  // con su propio índice de refracción, y se recomponen. El resultado es un
  // degradado continuo de arcoíris, como el de una pompa.
  vec3 refracted = vec3(0.0);
  for (int i = 0; i < SPECTRAL; i++) {
    float t = (float(i) + 0.5) / float(SPECTRAL);
    // El rojo se desvía menos que el violeta: eso es lo que abre el abanico.
    float ior = 1.0 + (t - 0.5) * uDispersion;
    vec2 o = offset * ior;
    refracted += spectrum(t) * scene(vUv - o, vUv - o * TEXT_REFRACT);
  }
  refracted /= 3.0;

  // Reflejo especular: una luz alta a la izquierda, como en la referencia.
  vec3 lightDir = normalize(vec3(-0.35, 0.72, 0.6));
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  vec3 halfVec = normalize(lightDir + viewDir);
  float specular = pow(max(dot(normal, halfVec), 0.0), 74.0);

  // Segundo reflejo, más ancho y tenue: da cuerpo a la gota.
  float sheen = pow(max(dot(normal, halfVec), 0.0), 9.0) * 0.16;

  // Fresnel: el canto brilla más que el centro.
  float fresnel = pow(1.0 - max(normal.z, 0.0), 2.6);

  // Interferencia de lámina fina. En una pompa el color depende del grosor
  // que atraviesa la luz, y por eso se ve en bandas que se repiten en vez de
  // en un degradado único. Aquí el grosor del campo hace de espesor.
  vec3 film = spectrum(fract(thickness * 1.9 + fresnel * 1.1 + 0.12));

  vec3 colour = refracted;

  // Cuerpo: una lámina de agua no es solo su canto. Recoge algo de luz difusa
  // en todo su grosor, y sin eso el líquido se ve como un contorno dibujado
  // encima de la escena en vez de como un volumen.
  colour += vec3(0.055) * thickness;

  colour += vec3(specular) * 1.7;
  colour += vec3(sheen);
  colour += vec3(fresnel) * 0.24;
  colour += film * uIridescence * edgeBoost * (0.35 + fresnel);

  fragColor = vec4(mix(sceneAberrated(vUv), colour, mask), 1.0);
}`;
