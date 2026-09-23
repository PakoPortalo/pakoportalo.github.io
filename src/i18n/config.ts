export const locales = ['es', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'es';

export const localeNames: Record<Locale, string> = {
  es: 'Español',
  en: 'English',
};

/**
 * Los dos módulos del portfolio. Música y sonido van juntos a propósito:
 * es el mismo oficio visto desde dos sitios.
 */
export const areas = ['audio', 'web'] as const;
export type Area = (typeof areas)[number];

/** Segmento de URL de cada módulo en cada idioma. */
export const areaSlugs: Record<Area, Record<Locale, string>> = {
  audio: { es: 'musica-y-sonido', en: 'music-and-sound' },
  web: { es: 'web', en: 'web' },
};

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}
