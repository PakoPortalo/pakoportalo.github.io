import type { Area, Locale } from './config';

/**
 * Todo el texto de interfaz vive aquí. Si añades una clave al objeto `es`,
 * TypeScript te obliga a añadirla también al `en`.
 */
const es = {
  'site.name': 'Pako Portalo',
  'site.tagline': 'Sonido, música y código',
  'site.description':
    'Portfolio de Pako Portalo: diseño y postproducción de sonido, composición musical y desarrollo web.',

  'nav.home': 'Inicio',
  'nav.about': 'Sobre mí',
  'nav.contact': 'Contacto',
  'nav.skipToContent': 'Saltar al contenido',
  'nav.menu': 'Menú',

  'area.audio': 'Música y Sonido',
  'area.web': 'Desarrollo Web',
  'area.audio.blurb':
    'Composición, diseño de sonido, grabación, mezcla y postproducción.',
  'area.web.blurb': 'Webs y herramientas a medida, del diseño al despliegue.',

  'home.intro':
    'Trabajo con el sonido desde dos sitios distintos: la mesa de mezclas y el editor de código.',
  'home.featured': 'Trabajos destacados',
  'home.viewArea': 'Ver todo',

  'hero.tagline': 'Música, sonido y código.',
  'hero.scroll': 'Ver el trabajo',
  'hero.picker': 'Estilo del hero (provisional)',

  'work.all': 'Todos los trabajos',
  'work.empty': 'Todavía no hay nada publicado en esta sección.',
  'work.year': 'Año',
  'work.role': 'Rol',
  'work.client': 'Cliente',
  'work.tags': 'Etiquetas',
  'work.visit': 'Ver proyecto',
  'work.repo': 'Código fuente',
  'work.back': 'Volver a',
  'work.watch': 'Reproducir vídeo',
  'work.noTranslation': 'Esta ficha aún no está traducida.',

  'lang.switch': 'Cambiar idioma',

  'footer.rights': 'Todos los derechos reservados.',
  'footer.builtWith': 'Hecho con Astro.',

  '404.title': 'Página no encontrada',
  '404.body': 'La dirección que has seguido no existe o ha cambiado.',
  '404.home': 'Ir al inicio',
} as const;

type UIKey = keyof typeof es;

const en: Record<UIKey, string> = {
  'site.name': 'Pako Portalo',
  'site.tagline': 'Sound, music and code',
  'site.description':
    'Portfolio of Pako Portalo: sound design and post-production, music composition and web development.',

  'nav.home': 'Home',
  'nav.about': 'About',
  'nav.contact': 'Contact',
  'nav.skipToContent': 'Skip to content',
  'nav.menu': 'Menu',

  'area.audio': 'Music & Sound',
  'area.web': 'Web Development',
  'area.audio.blurb':
    'Composition, sound design, recording, mixing and post-production.',
  'area.web.blurb': 'Custom websites and tools, from design through deployment.',

  'home.intro':
    'I work with sound from two different places: the mixing desk and the code editor.',
  'home.featured': 'Selected work',
  'home.viewArea': 'View all',

  'hero.tagline': 'Music, sound and code.',
  'hero.scroll': 'See the work',
  'hero.picker': 'Hero style (temporary)',

  'work.all': 'All work',
  'work.empty': 'Nothing published in this section yet.',
  'work.year': 'Year',
  'work.role': 'Role',
  'work.client': 'Client',
  'work.tags': 'Tags',
  'work.visit': 'Visit project',
  'work.repo': 'Source code',
  'work.back': 'Back to',
  'work.watch': 'Play video',
  'work.noTranslation': 'This entry has not been translated yet.',

  'lang.switch': 'Switch language',

  'footer.rights': 'All rights reserved.',
  'footer.builtWith': 'Built with Astro.',

  '404.title': 'Page not found',
  '404.body': 'The address you followed does not exist or has changed.',
  '404.home': 'Go to homepage',
};

const dictionaries = { es, en } satisfies Record<Locale, Record<UIKey, string>>;

/** t('nav.home') devuelve el texto en el idioma dado. */
export function useTranslations(locale: Locale) {
  return function t(key: UIKey): string {
    return dictionaries[locale][key];
  };
}

export function areaLabel(area: Area, locale: Locale): string {
  return dictionaries[locale][`area.${area}` as UIKey];
}

export function areaBlurb(area: Area, locale: Locale): string {
  return dictionaries[locale][`area.${area}.blurb` as UIKey];
}

export type { UIKey };
