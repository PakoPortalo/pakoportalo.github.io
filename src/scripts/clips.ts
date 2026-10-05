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

export const cargarClip = (video: HTMLVideoElement) => {
  if (video.dataset.cargado !== undefined) return;
  video.dataset.cargado = '';
  video.querySelectorAll('source').forEach((fuente) => {
    if (fuente.dataset.src) fuente.src = fuente.dataset.src;
  });
  video.load();
};

export const reproducirClip = (video: HTMLVideoElement) => {
  cargarClip(video);
  if (!quieto()) video.play().catch(() => {});
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
        else video.pause();
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
