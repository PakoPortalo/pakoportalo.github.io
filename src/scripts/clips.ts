/**
 * Carga perezosa de los clips de proyectos.
 *
 * Los <video> llegan sin src: las rutas esperan en data-src hasta que el clip
 * se acerca a la pantalla. Así la página no paga los ~1,6 MB de vídeo hasta
 * que alguien baja hasta ellos, y mientras tanto se ve el póster.
 *
 * Se reproducen solo mientras se ven: un clip que sale de pantalla se pausa,
 * para no tener cuatro decodificadores trabajando para nadie.
 */
const quieto = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/*
  El AV1 solo si el aparato lo decodifica con hardware. Hay móviles que
  dicen poder con él, se quedan atascados en el WebM y nunca pasan al mp4:
  se veía el póster en lugar del vídeo. Se pregunta una vez para todos.
*/
let av1: Promise<boolean> | null = null;
const puedeAv1 = () => {
  av1 ??= (async () => {
    try {
      const info = await navigator.mediaCapabilities.decodingInfo({
        type: 'file',
        video: {
          contentType: 'video/webm; codecs="av01.0.05M.08"',
          width: 1280,
          height: 720,
          bitrate: 1_000_000,
          framerate: 25,
        },
      });
      return info.supported && info.smooth && info.powerEfficient;
    } catch {
      return false;
    }
  })();
  return av1;
};

/** Deja solo el mp4 y vuelve a cargar. */
const soloMp4 = (video: HTMLVideoElement) => {
  video.querySelectorAll('source[type^="video/webm"]').forEach((fuente) => fuente.remove());
  video.load();
};

export const cargarClip = async (video: HTMLVideoElement) => {
  if (video.dataset.cargado !== undefined) return;
  video.dataset.cargado = '';
  const conAv1 = await puedeAv1();
  video.querySelectorAll<HTMLSourceElement>('source').forEach((fuente) => {
    if (!conAv1 && fuente.type.startsWith('video/webm')) fuente.remove();
    else if (fuente.dataset.src) fuente.src = fuente.dataset.src;
  });
  // Y si aun así el WebM falla al decodificar, se pasa al mp4.
  video.addEventListener(
    'error',
    () => {
      if (video.querySelector('source[type^="video/webm"]')) soloMp4(video);
    },
    { once: true },
  );
  video.querySelector('source[type^="video/webm"]')?.addEventListener('error', () => soloMp4(video), { once: true });
  video.load();
  if (video.dataset.quiereSonar !== undefined) intentar(video);
};

/*
  Hay iPhones que no dejan que ningún vídeo arranque solo, aunque vaya mudo y
  en línea: play() responde NotAllowedError (pasa con el modo de ahorro de
  batería y con algún ajuste de accesibilidad). Las imágenes animadas no
  tienen esa traba, así que en ese caso el vídeo se cambia por su WebP
  animado (data-animado), que ocupa lo mismo y se coloca en su sitio. Las
  clases y estilos del vídeo pasan a la imagen.
*/
const aImagen = (video: HTMLVideoElement) => {
  const ruta = video.dataset.animado;
  if (!ruta || video.dataset.sustituido !== undefined) return;
  video.dataset.sustituido = '';
  const imagen = document.createElement('img');
  imagen.src = ruta;
  imagen.alt = '';
  imagen.setAttribute('aria-hidden', 'true');
  imagen.setAttribute('data-clip-animado', '');
  imagen.className = video.className;
  imagen.decoding = 'async';
  video.pause();
  video.replaceWith(imagen);
};

const intentar = (video: HTMLVideoElement) => {
  if (quieto() || video.dataset.sustituido !== undefined) return;
  video.play().catch((error: DOMException) => {
    if (error?.name === 'NotAllowedError') aImagen(video);
  });
};

export const reproducirClip = (video: HTMLVideoElement) => {
  video.dataset.quiereSonar = '';
  void cargarClip(video);
  intentar(video);
};

let observando = false;

/**
 * Engancha todos los clips automáticos de la página. Los marcados con
 * data-manual los gobierna su propio módulo (por ejemplo, la vista previa que
 * sigue al cursor), que decide cuándo cargarlos y cuándo darles al play.
 */
export const observarClips = () => {
  if (observando) return;
  observando = true;

  const cerca = new IntersectionObserver(
    (entradas) => {
      for (const entrada of entradas) {
        if (!entrada.isIntersecting) continue;
        cargarClip(entrada.target as HTMLVideoElement);
        cerca.unobserve(entrada.target);
      }
    },
    { rootMargin: '400px 0px' },
  );

  const visible = new IntersectionObserver(
    (entradas) => {
      for (const entrada of entradas) {
        const video = entrada.target as HTMLVideoElement;
        if (entrada.isIntersecting) reproducirClip(video);
        else {
          delete video.dataset.quiereSonar;
          video.pause();
        }
      }
    },
    { threshold: 0.15 },
  );

  document
    .querySelectorAll<HTMLVideoElement>('video[data-clip]:not([data-manual])')
    .forEach((video) => {
      cerca.observe(video);
      visible.observe(video);
    });
};
