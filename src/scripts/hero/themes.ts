import * as THREE from 'three';
import fontAvant from '../../assets/font-avant.json';
import fontHeat from '../../assets/font-heat.json';
import fontTechno from '../../assets/font-techno.json';
import fontGran from '../../assets/font-gran.json';
import fontZerk from '../../assets/font-zerk.json';
import type { LayoutOptions } from './layout';
import { blobGeometry, ringGeometry, wormGeometry } from './shapes';
import {
  barcodeTexture,
  gridTexture,
  labelStrip,
  ornamentTexture,
  radialBackdrop,
  thermalField,
  thermalMatcap,
} from './textures';

export const themeIds = ['avant', 'heat', 'techno', 'gran', 'zerk'] as const;
export type ThemeId = (typeof themeIds)[number];
export const defaultTheme: ThemeId = 'avant';

export const themeNames: Record<ThemeId, string> = {
  avant: 'Avant Basic',
  heat: 'Heat Map',
  techno: 'Techno Geometry',
  gran: 'Gran Blue',
  zerk: 'Zerk',
};

export function isThemeId(value: string | null): value is ThemeId {
  return value !== null && (themeIds as readonly string[]).includes(value);
}

/** Recursos que hay que liberar al cambiar de estilo. */
type Disposable = { dispose(): void };

export interface ThemeContext {
  scene: THREE.Scene;
  /** Capas de fondo, de lejos a cerca; cada una se mueve a otra velocidad. */
  layers: [THREE.Group, THREE.Group, THREE.Group];
  track<T extends Disposable>(resource: T): T;
}

export interface ThemeBuild {
  letterMaterial: THREE.Material;
  /** Contorno alrededor de cada letra, dibujado por detrás. */
  outline?: { color: number; thickness: number };
  update?(time: number, pointer: THREE.Vector2): void;
}

export interface Theme {
  fontData: unknown;
  layout: LayoutOptions;
  /** Colores que adopta la página (cabecera, textos, botones). */
  page: { bg: string; fg: string; muted: string; line: string };
  build(context: ThemeContext): ThemeBuild;
}

// ---------------------------------------------------------------------------

/** Reparte objetos por la pantalla sin agruparlos, de forma determinista. */
function scatter(count: number, spread: number, depth: number) {
  return Array.from({ length: count }, (_, index) => {
    const angle = index * 2.399; // ángulo áureo
    const radius = Math.sqrt((index + 0.5) / count) * spread;
    return {
      index,
      position: new THREE.Vector3(
        Math.cos(angle) * radius * 1.45,
        Math.sin(angle) * radius,
        depth + ((index * 3) % 5) * 0.4,
      ),
      spin: new THREE.Vector3(
        0.04 + (index % 4) * 0.03,
        0.05 + (index % 3) * 0.035,
        0.02 + (index % 5) * 0.018,
      ),
      phase: index * 0.77,
    };
  });
}

// ---------------------------------------------------------------------------
// Avant Basic: letras hinchadas, color plano, cero aire.
// ---------------------------------------------------------------------------

const AVANT_BLOBS = [0xff4a1c, 0x1f3ee8, 0xffd93d, 0x17b890, 0xff9ec7, 0xfff6e8];

const avant: Theme = {
  fontData: fontAvant,
  layout: {
    depth: 0.2,
    bevel: 0.04,
    tracking: -0.035,
    arc: 0.035,
    arcDepth: 0.06,
    leading: 1.04,
  },
  page: { bg: '#ff4a1c', fg: '#fff6e8', muted: '#ffd9c8', line: 'rgb(255 246 232 / 0.55)' },

  build({ scene, layers, track }) {
    scene.background = new THREE.Color(0xff4a1c);
    scene.fog = null;

    const ambient = new THREE.HemisphereLight(0xffffff, 0xff7a4a, 1.5);
    const key = new THREE.DirectionalLight(0xfff4e6, 2.2);
    key.position.set(-3, 5, 6);
    scene.add(ambient, key);

    // Tres capas cargadas de bultos: la escena no debe tener huecos.
    const counts = [22, 16, 9];
    const spreads = [10, 7.5, 5.5];
    const depths = [-9, -5, 1.6];
    const sizes = [1.5, 1.1, 0.75];

    counts.forEach((count, layerIndex) => {
      const layer = layers[layerIndex]!;
      for (const item of scatter(count, spreads[layerIndex]!, depths[layerIndex]!)) {
        const kind = item.index % 3;
        const geometry = track(
          kind === 0
            ? blobGeometry(item.index)
            : kind === 1
              ? wormGeometry()
              : ringGeometry(),
        );
        const material = track(
          new THREE.MeshToonMaterial({
            color: AVANT_BLOBS[(item.index + layerIndex) % AVANT_BLOBS.length]!,
          }),
        );

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(item.position);
        mesh.scale.setScalar(sizes[layerIndex]! * (0.65 + ((item.index * 5) % 6) / 9));
        mesh.rotation.set(item.index, item.index * 1.7, item.index * 0.4);
        mesh.userData.item = item;
        layer.add(mesh);
      }
    });

    return {
      letterMaterial: track(new THREE.MeshToonMaterial({ color: 0xfff6e8 })),
      outline: { color: 0x1a0b05, thickness: 0.035 },
    };
  },
};

// ---------------------------------------------------------------------------
// Heat Map: rampa termográfica como material, contenida por una retícula.
// ---------------------------------------------------------------------------

const heat: Theme = {
  fontData: fontHeat,
  layout: {
    depth: 0.16,
    bevel: 0.035,
    tracking: -0.02,
    arc: 0.045,
    arcDepth: 0.07,
    leading: 1.05,
  },
  page: { bg: '#050a2e', fg: '#fff4d6', muted: '#8fb0d8', line: 'rgb(255 244 214 / 0.4)' },

  build({ scene, layers, track }) {
    const field = track(thermalField(11));
    scene.background = field;
    scene.fog = null;

    // Plano lejano con el campo térmico: da profundidad al fondo de escena.
    const backdrop = new THREE.Mesh(
      track(new THREE.PlaneGeometry(46, 30)),
      track(new THREE.MeshBasicMaterial({ map: track(thermalField(7)) })),
    );
    backdrop.position.z = -14;
    layers[0]!.add(backdrop);

    // Retícula que contiene el caos cromático, como en el cartel de referencia.
    const grid = new THREE.Mesh(
      track(new THREE.PlaneGeometry(34, 22)),
      track(
        new THREE.MeshBasicMaterial({
          map: track(gridTexture('rgba(255,244,214,0.5)', 7, 2)),
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        }),
      ),
    );
    grid.position.z = -6;
    layers[1]!.add(grid);

    // Focos de calor sueltos, en mezcla aditiva: florecen sobre el fondo.
    const bloomTexture = track(radialBackdrop('#fff4d6', 'rgba(255,60,20,0)'));
    for (const item of scatter(10, 8, -3)) {
      const bloom = new THREE.Mesh(
        track(new THREE.PlaneGeometry(4, 4)),
        track(
          new THREE.MeshBasicMaterial({
            map: bloomTexture,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            opacity: 0.32,
            toneMapped: false,
          }),
        ),
      );
      bloom.position.copy(item.position);
      bloom.userData.item = item;
      layers[2]!.add(bloom);
    }

    // Mancha de calor que persigue al cursor.
    const cursorHeat = new THREE.Mesh(
      track(new THREE.PlaneGeometry(7, 7)),
      track(
        new THREE.MeshBasicMaterial({
          map: bloomTexture,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          opacity: 0.5,
          toneMapped: false,
        }),
      ),
    );
    cursorHeat.position.z = -2;
    scene.add(cursorHeat);

    return {
      letterMaterial: track(
        new THREE.MeshMatcapMaterial({ matcap: track(thermalMatcap()) }),
      ),
      update(_time, pointer) {
        // El calor va por detrás de las letras y con retardo, no pegado al ratón.
        cursorHeat.position.x += (pointer.x * 7 - cursorHeat.position.x) * 0.06;
        cursorHeat.position.y += (-pointer.y * 4.5 - cursorHeat.position.y) * 0.06;
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Techno Geometry: planos girados, franjas técnicas, acento que chilla.
// ---------------------------------------------------------------------------

const TECHNO_BANDS = [0xe8ff3a, 0xffffff, 0xff2d20, 0x15151a];

const techno: Theme = {
  fontData: fontTechno,
  layout: {
    depth: 0.12,
    bevel: 0.02,
    tracking: -0.012,
    arc: 0.028,
    arcDepth: 0.05,
    leading: 1.02,
  },
  page: { bg: '#101014', fg: '#f4f4f0', muted: '#9a9a92', line: 'rgb(232 255 58 / 0.55)' },

  build({ scene, layers, track }) {
    scene.background = new THREE.Color(0x101014);
    scene.fog = new THREE.Fog(0x101014, 16, 34);

    const ambient = new THREE.AmbientLight(0xffffff, 1.6);
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(2, 4, 8);
    scene.add(ambient, key);

    // Bandas diagonales cruzando la escena a distintas profundidades.
    const bandCounts = [7, 5, 3];
    const bandDepths = [-11, -6, 2];

    bandCounts.forEach((count, layerIndex) => {
      const layer = layers[layerIndex]!;
      for (let index = 0; index < count; index += 1) {
        const color = TECHNO_BANDS[(index + layerIndex) % TECHNO_BANDS.length]!;
        const height = 0.5 + ((index * 3) % 4) * 0.42;

        const band = new THREE.Mesh(
          track(new THREE.PlaneGeometry(40, height)),
          track(new THREE.MeshBasicMaterial({ color, toneMapped: false })),
        );
        band.position.set(
          ((index * 5) % 7) - 3,
          ((index * 7) % 11) - 5 + layerIndex * 0.7,
          bandDepths[layerIndex]! + index * 0.25,
        );
        // Diagonales, nunca horizontales: es lo que da la tensión del estilo.
        band.rotation.z = (-0.5 + ((index * 3) % 5) / 4) * 0.7;
        band.userData.item = { spin: new THREE.Vector3(), phase: index };
        layer.add(band);
      }
    });

    // Tiras de código de barras: el detalle industrial.
    const barcode = track(barcodeTexture('#101014', '#e8ff3a'));
    for (let index = 0; index < 5; index += 1) {
      const strip = new THREE.Mesh(
        track(new THREE.PlaneGeometry(9, 0.62)),
        track(new THREE.MeshBasicMaterial({ map: barcode, toneMapped: false })),
      );
      strip.position.set(
        ((index * 11) % 13) - 6,
        ((index * 5) % 9) - 4,
        -7 + index * 0.9,
      );
      strip.rotation.z = (-0.4 + ((index * 7) % 5) / 5) * 0.8;
      layers[1]!.add(strip);
    }

    // Reglas finas: rellenan el aire que queda entre bandas.
    for (let index = 0; index < 14; index += 1) {
      const rule = new THREE.Mesh(
        track(new THREE.PlaneGeometry(36, 0.018)),
        track(
          new THREE.MeshBasicMaterial({
            color: 0xe8ff3a,
            transparent: true,
            opacity: 0.22,
            toneMapped: false,
          }),
        ),
      );
      rule.position.set(0, index * 0.95 - 6.5, -12.5);
      rule.rotation.z = -0.12;
      layers[0]!.add(rule);
    }

    return {
      letterMaterial: track(
        new THREE.MeshStandardMaterial({
          color: 0xf4f4f0,
          roughness: 0.42,
          metalness: 0.15,
        }),
      ),
      outline: { color: 0x101014, thickness: 0.022 },
    };
  },
};


// ---------------------------------------------------------------------------
// Gran Blue: display de contraste extremo, casi plano, sobre azul profundo.
// Aquí el volumen estorba: el interés está en la letra y en el encaje.
// ---------------------------------------------------------------------------

const gran: Theme = {
  fontData: fontGran,
  layout: {
    depth: 0.05,
    bevel: 0.006,
    // Negativo: las letras se tocan, como en la referencia, pero sin que las
    // dos líneas se pisen hasta volverse ilegibles.
    tracking: -0.045,
    arc: 0.012,
    arcDepth: 0.008,
    leading: 1.02,
  },
  page: { bg: '#0b1a3d', fg: '#f4f6ff', muted: '#93a6d8', line: 'rgb(244 246 255 / 0.45)' },

  build({ scene, layers, track }) {
    scene.background = new THREE.Color(0x0b1a3d);
    scene.fog = null;

    const ornament = track(ornamentTexture('rgba(244,246,255,0.85)'));

    // Marcos concéntricos a distintas profundidades: al moverse con parallax
    // se desalinean entre sí y dan sensación de caja tipográfica.
    const frameDepths = [-8, -4.2, -1.4];
    const frameSizes = [30, 22, 17];
    frameDepths.forEach((depth, index) => {
      const frame = new THREE.Mesh(
        track(new THREE.PlaneGeometry(frameSizes[index]!, frameSizes[index]! * 0.66)),
        track(
          new THREE.MeshBasicMaterial({
            map: ornament,
            transparent: true,
            opacity: 0.16 + index * 0.12,
            depthWrite: false,
            toneMapped: false,
          }),
        ),
      );
      frame.position.z = depth;
      layers[index]!.add(frame);
    });

    // Reglas finas horizontales: la retícula editorial de fondo.
    for (let index = 0; index < 18; index += 1) {
      const rule = new THREE.Mesh(
        track(new THREE.PlaneGeometry(34, 0.008)),
        track(
          new THREE.MeshBasicMaterial({
            color: 0xf4f6ff,
            transparent: true,
            opacity: 0.14,
            depthWrite: false,
            toneMapped: false,
          }),
        ),
      );
      rule.position.set(0, index * 0.78 - 6.6, -10);
      layers[0]!.add(rule);
    }

    // Plano, sin luces: el color de la letra no debe variar por la extrusión.
    return { letterMaterial: track(new THREE.MeshBasicMaterial({ color: 0xf4f6ff })) };
  },
};

// ---------------------------------------------------------------------------
// Zerk: condensada cuadrada, verde ácido sobre negro, densidad de etiquetas.
// ---------------------------------------------------------------------------

const ZERK_LABELS = [
  'KINETIC ENGINE', 'V03', 'EL LT RG MD SB BO XB BL', 'NITROUS OXYDE',
  'LASER', 'RADIOACTIVE', 'DECAY DISTORT', '800 COND', 'VARIABLE',
];

const zerk: Theme = {
  fontData: fontZerk,
  layout: {
    depth: 0.045,
    bevel: 0.004,
    tracking: -0.01,
    arc: 0.008,
    arcDepth: 0.006,
    leading: 1.03,
  },
  page: { bg: '#07070a', fg: '#c9f531', muted: '#7d8a5c', line: 'rgb(201 245 49 / 0.5)' },

  build({ scene, layers, track }) {
    scene.background = new THREE.Color(0x07070a);
    scene.fog = null;

    // Bandas de etiquetas técnicas apiladas: puro relleno de información.
    const stripColors: Array<[number, number]> = [
      [0xc9f531, 0x07070a],
      [0xffffff, 0x07070a],
      [0x07070a, 0xc9f531],
    ];

    for (let index = 0; index < 11; index += 1) {
      const [ink, paper] = stripColors[index % stripColors.length]!;
      const texture = track(
        labelStrip(
          ZERK_LABELS.slice(index % 4, (index % 4) + 4),
          `#${ink.toString(16).padStart(6, '0')}`,
          `#${paper.toString(16).padStart(6, '0')}`,
        ),
      );
      texture.repeat.set(1.6, 1);

      const strip = new THREE.Mesh(
        track(new THREE.PlaneGeometry(34, 0.34)),
        track(new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })),
      );
      strip.position.set(0, index * 1.15 - 5.8, -9 + (index % 3) * 0.4);
      layers[index % 2]!.add(strip);
    }

    // Líneas verticales finas: la rejilla técnica que sostiene todo.
    for (let index = 0; index < 22; index += 1) {
      const line = new THREE.Mesh(
        track(new THREE.PlaneGeometry(0.012, 22)),
        track(
          new THREE.MeshBasicMaterial({
            color: 0xc9f531,
            transparent: true,
            opacity: 0.16,
            depthWrite: false,
            toneMapped: false,
          }),
        ),
      );
      line.position.set(index * 1.35 - 14, 0, -11);
      layers[0]!.add(line);
    }

    // Franjas de código de barras en primer plano, cortando la composición.
    const barcode = track(barcodeTexture('#07070a', '#c9f531'));
    for (let index = 0; index < 3; index += 1) {
      const strip = new THREE.Mesh(
        track(new THREE.PlaneGeometry(7, 0.5)),
        track(new THREE.MeshBasicMaterial({ map: barcode, toneMapped: false })),
      );
      strip.position.set(((index * 9) % 11) - 5, ((index * 7) % 8) - 3.5, 1.4);
      layers[2]!.add(strip);
    }

    return { letterMaterial: track(new THREE.MeshBasicMaterial({ color: 0xc9f531 })) };
  },
};

export const THEMES: Record<ThemeId, Theme> = { avant, heat, techno, gran, zerk };
