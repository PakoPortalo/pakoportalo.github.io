import { getCollection, type CollectionEntry } from 'astro:content';
import {
  areaSlugs,
  defaultLocale,
  isLocale,
  type Area,
  type Locale,
} from './config';

/** Base del sitio ('/' o '/mi-repo/'), siempre con barra final. */
const BASE = import.meta.env.BASE_URL.replace(/\/*$/, '/');

/**
 * Construye una ruta absoluta respetando el idioma y el `base` del sitio.
 * El idioma por defecto (es) no lleva prefijo; el resto sí.
 *   path('es', 'sonido')       -> /sonido/
 *   path('en', 'sound', 'foo') -> /en/sound/foo/
 */
export function path(locale: Locale, ...segments: string[]): string {
  const parts = [
    ...(locale === defaultLocale ? [] : [locale]),
    ...segments.filter(Boolean),
  ];
  return BASE + (parts.length ? parts.join('/') + '/' : '');
}

export function areaPath(area: Area, locale: Locale): string {
  return path(locale, areaSlugs[area][locale]);
}

export function workPath(area: Area, locale: Locale, slug: string): string {
  return path(locale, areaSlugs[area][locale], slug);
}

/** Lee el idioma del primer segmento de la URL. Sin prefijo => idioma por defecto. */
export function getLocaleFromUrl(url: URL): Locale {
  const withoutBase = url.pathname.slice(BASE.length);
  const [first] = withoutBase.split('/').filter(Boolean);
  return first && isLocale(first) ? first : defaultLocale;
}

/** Los ids vienen como "es/mi-proyecto". Los partimos en idioma y slug. */
export function splitId(id: string): { locale: Locale; slug: string } {
  const [first, ...rest] = id.split('/');
  if (first && isLocale(first) && rest.length) {
    return { locale: first, slug: rest.join('/') };
  }
  return { locale: defaultLocale, slug: id };
}

export type Work = CollectionEntry<Area>;

/**
 * Trabajos de un área y un idioma, ya ordenados y sin borradores.
 * Orden: primero los que tengan `order`, luego por año descendente.
 */
export async function getWorks(area: Area, locale: Locale): Promise<Work[]> {
  const entries = await getCollection(area, ({ data }) => {
    return import.meta.env.DEV || !data.draft;
  });

  return entries
    .filter((entry) => splitId(entry.id).locale === locale)
    .sort((a, b) => {
      const ao = a.data.order ?? Infinity;
      const bo = b.data.order ?? Infinity;
      if (ao !== bo) return ao - bo;
      return (b.data.year ?? 0) - (a.data.year ?? 0);
    });
}

/** Trabajos destacados de todas las áreas, con el área a la que pertenecen. */
export async function getFeatured(
  locale: Locale,
  areas: readonly Area[],
): Promise<{ area: Area; work: Work }[]> {
  const perArea = await Promise.all(
    areas.map(async (area) =>
      (await getWorks(area, locale))
        .filter((work) => work.data.featured)
        .map((work) => ({ area, work })),
    ),
  );
  return perArea.flat();
}

/**
 * La misma URL en el otro idioma. Si estamos en una ficha y no existe
 * traducción, devolvemos el índice del área en el idioma destino.
 */
export async function alternatePath(
  target: Locale,
  current: { area?: Area; slug?: string },
): Promise<string> {
  const { area, slug } = current;
  if (!area) return path(target);
  if (!slug) return areaPath(area, target);

  const translated = await getWorks(area, target);
  const exists = translated.some((work) => splitId(work.id).slug === slug);
  return exists ? workPath(area, target, slug) : areaPath(area, target);
}

/** Miniatura de YouTube cuando la ficha no trae portada propia. */
export function youtubeThumb(id: string): string {
  return `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
}
