import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { layoutLines, type Letter } from './layout';
import { THEMES, type ThemeBuild, type ThemeId } from './themes';

const LINES = ['PAKO', 'PORTALO'] as const;

/** Velocidad del parallax de cada capa de fondo, de lejos a cerca. */
const LAYER_PARALLAX = [0.25, 0.6, 1.25];

/**
 * Giro máximo de la escena con el ratón, en radianes.
 * El encaje los necesita: al girar, el borde cercano del bloque se aproxima a
 * la cámara y la perspectiva lo agranda. Ignorarlo saca las letras del marco.
 */
const MAX_ROT_Y = 0.12;
const MAX_ROT_X = 0.08;
const DRIFT_Y = 0.03;
const DRIFT_X = 0.025;

export interface HeroOptions {
  reducedMotion: boolean;
}

export interface HeroHandle {
  setTheme(theme: ThemeId): void;
  destroy(): void;
}

interface LetterNode {
  group: THREE.Group;
  letter: Letter;
  /** Puntero propio, con retardo distinto por letra: crea una onda. */
  pointer: THREE.Vector2;
}

export function createHero(
  canvas: HTMLCanvasElement,
  initialTheme: ThemeId,
  options: HeroOptions,
): HeroHandle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
  camera.position.set(0, 0, 8);

  /** Inclinar este grupo inclina la escena entera. */
  const world = new THREE.Group();
  scene.add(world);

  const layers: [THREE.Group, THREE.Group, THREE.Group] = [
    new THREE.Group(),
    new THREE.Group(),
    new THREE.Group(),
  ];
  const letterGroup = new THREE.Group();
  world.add(...layers, letterGroup);

  const fontLoader = new FontLoader();

  let theme: ThemeId = initialTheme;
  let build: ThemeBuild | null = null;
  let nodes: LetterNode[] = [];
  let blockWidth = 1;
  let blockHeight = 1;
  let blockFront = 0;

  /** Todo lo que el estilo actual haya creado y haya que liberar. */
  let owned: Array<{ dispose(): void }> = [];

  function track<T extends { dispose(): void }>(resource: T): T {
    owned.push(resource);
    return resource;
  }

  function teardown() {
    for (const layer of layers) {
      layer.clear();
    }
    letterGroup.clear();
    // Las luces y la mancha del cursor cuelgan de la escena, no de las capas.
    for (const child of [...scene.children]) {
      if (child !== world) scene.remove(child);
    }
    owned.forEach((resource) => resource.dispose());
    owned = [];
    nodes = [];
    build = null;
    scene.background = null;
    scene.fog = null;
  }

  function buildTheme(next: ThemeId) {
    teardown();

    const config = THEMES[next];
    const font = fontLoader.parse(config.fontData as never);

    build = config.build({ scene, layers, track });

    const layout = layoutLines(LINES, font, config.layout);
    blockWidth = layout.width;
    blockHeight = layout.height;
    blockFront = layout.front;

    for (const letter of layout.letters) {
      track(letter.geometry);

      const group = new THREE.Group();
      group.position.copy(letter.base);
      group.rotation.copy(letter.baseRotation);
      group.scale.setScalar(letter.scale);

      const mesh = new THREE.Mesh(letter.geometry, build.letterMaterial);
      group.add(mesh);

      // Contorno: la misma letra por dentro, algo más grande y vista por detrás.
      if (build.outline) {
        const outline = new THREE.Mesh(
          letter.geometry,
          track(
            new THREE.MeshBasicMaterial({
              color: build.outline.color,
              side: THREE.BackSide,
              toneMapped: false,
            }),
          ),
        );
        outline.scale.setScalar(1 + build.outline.thickness);
        group.add(outline);
      }

      letterGroup.add(group);
      nodes.push({ group, letter, pointer: new THREE.Vector2() });
    }

    theme = next;
  }

  // --- Encaje responsivo ----------------------------------------------------

  let shiftX = 0.3;
  let shiftY = 0.22;

  function fit() {
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;

    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    // El encaje se resuelve en dos pasadas. La escala depende del plano más
    // cercano del bloque, y ese plano depende de la escala: girado con el
    // ratón, la esquina que se adelanta es la que manda. Dos iteraciones
    // bastan para converger.
    const widthFactor = camera.aspect < 1 ? 0.8 : 0.88;
    const heightFactor = 0.58;
    const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2;

    let scale = letterGroup.scale.x || 1;
    let visibleWidth = 1;
    let visibleHeight = 1;

    for (let pass = 0; pass < 3; pass += 1) {
      const approach =
        blockFront * scale +
        ((blockWidth * scale) / 2) * Math.sin(MAX_ROT_Y + DRIFT_Y) +
        ((blockHeight * scale) / 2) * Math.sin(MAX_ROT_X + DRIFT_X);

      const distance = Math.max(camera.position.z - approach, 0.5);
      visibleHeight = 2 * Math.tan(halfFov) * distance;
      visibleWidth = visibleHeight * camera.aspect;

      scale = Math.min(
        (visibleWidth * widthFactor) / blockWidth,
        (visibleHeight * heightFactor) / blockHeight,
      );
    }

    letterGroup.scale.setScalar(scale);

    shiftX = visibleWidth * 0.03;
    shiftY = visibleHeight * 0.028;

  }

  // --- Interacción ----------------------------------------------------------

  const pointerTarget = new THREE.Vector2();
  const pointer = new THREE.Vector2();

  function onPointerMove(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    pointerTarget.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      ((event.clientY - rect.top) / rect.height) * 2 - 1,
    );
  }

  function onPointerLeave() {
    pointerTarget.set(0, 0);
  }

  // --- Bucle ----------------------------------------------------------------

  let frame = 0;
  let running = false;
  let lastTime = 0;
  let elapsed = 0;

  function render() {
    renderer.render(scene, camera);
  }

  function tick(now: number) {
    frame = requestAnimationFrame(tick);

    const seconds = now / 1000;
    const delta = lastTime === 0 ? 1 / 60 : Math.min(seconds - lastTime, 0.1);
    lastTime = seconds;
    elapsed += delta;

    const damping = 1 - Math.pow(0.0015, delta);
    pointer.x += (pointerTarget.x - pointer.x) * damping;
    pointer.y += (pointerTarget.y - pointer.y) * damping;

    // Deriva lenta: la escena nunca queda del todo quieta.
    world.rotation.y = pointer.x * MAX_ROT_Y + Math.cos(elapsed * 0.19) * DRIFT_Y;
    world.rotation.x = pointer.y * MAX_ROT_X + Math.sin(elapsed * 0.24) * DRIFT_X;

    // Parallax: cada capa responde al ratón a su propia velocidad.
    layers.forEach((layer, index) => {
      const factor = LAYER_PARALLAX[index]!;
      layer.position.x = -pointer.x * shiftX * factor * 2.2;
      layer.position.y = pointer.y * shiftY * factor * 2.2;

      for (const child of layer.children) {
        const item = child.userData.item as
          | { spin: THREE.Vector3; phase: number }
          | undefined;
        if (!item) continue;
        child.rotation.x += item.spin.x * delta;
        child.rotation.y += item.spin.y * delta;
        child.rotation.z += item.spin.z * delta;
        child.position.y += Math.sin(elapsed * 0.5 + item.phase) * delta * 0.25;
      }
    });

    // Las letras siguen al ratón con retardo escalonado: las de la derecha
    // llegan más tarde, y el conjunto se mueve como una onda y no como un bloque.
    for (const node of nodes) {
      const lag = 1 - 0.55 * node.letter.t;
      const letterDamping = 1 - Math.pow(0.02, delta * lag);
      node.pointer.x += (pointer.x - node.pointer.x) * letterDamping;
      node.pointer.y += (pointer.y - node.pointer.y) * letterDamping;

      const breathe = Math.sin(elapsed * 0.9 + node.letter.t * 4 + node.letter.line) * 0.03;

      node.group.position.set(
        node.letter.base.x + node.pointer.x * shiftX * 0.6,
        node.letter.base.y - node.pointer.y * shiftY * 0.6 + breathe,
        node.letter.base.z + node.pointer.x * 0.12 * (node.letter.t - 0.5),
      );
      node.group.rotation.set(
        node.letter.baseRotation.x - node.pointer.y * 0.16,
        node.letter.baseRotation.y + node.pointer.x * 0.22,
        node.letter.baseRotation.z,
      );
    }

    build?.update?.(elapsed, pointer);
    render();
  }

  function start() {
    if (running || options.reducedMotion) return;
    running = true;
    lastTime = 0;
    frame = requestAnimationFrame(tick);
  }

  function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(frame);
  }

  // --- Ciclo de vida --------------------------------------------------------

  const resizeObserver = new ResizeObserver(() => {
    fit();
    if (!running) render();
  });
  resizeObserver.observe(canvas);

  const intersectionObserver = new IntersectionObserver(
    ([entry]) => {
      if (entry?.isIntersecting) start();
      else stop();
    },
    { threshold: 0 },
  );
  intersectionObserver.observe(canvas);

  function onVisibilityChange() {
    if (document.hidden) stop();
    else if (canvas.isConnected) start();
  }

  document.addEventListener('visibilitychange', onVisibilityChange);

  if (!options.reducedMotion) {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    canvas.addEventListener('pointerleave', onPointerLeave);
  }

  buildTheme(initialTheme);
  fit();
  render();

  return {
    setTheme(next: ThemeId) {
      if (next === theme) return;
      buildTheme(next);
      fit();
      if (!running) render();
    },
    destroy() {
      stop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      teardown();
      renderer.dispose();
    },
  };
}

export { themeIds, themeNames, defaultTheme, isThemeId, THEMES } from './themes';
export type { ThemeId } from './themes';
