// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

/**
 * `site` debe apuntar a la URL final publicada: de ahí salen las URLs
 * canónicas, los hreflang y el sitemap.
 *
 * GitHub Pages:
 *  - repo llamado "pakoportalo.github.io" o dominio propio -> deja `base` comentado.
 *  - repo con otro nombre (p.ej. "PakoPortaloWeb") -> descomenta `base` y pon
 *    "/PakoPortaloWeb", y cambia `site` a "https://pakoportalo.github.io".
 */
export default defineConfig({
  site: 'https://pakoportalo.github.io',
  // base: '/PakoPortaloWeb',

  // La barra flotante de Astro estorbaba al valorar el diseño. Solo aparece
  // en `astro dev`, nunca en el sitio publicado, pero mejor quitarla.
  devToolbar: { enabled: false },

  i18n: {
    locales: ['es', 'en'],
    defaultLocale: 'es',
    routing: {
      prefixDefaultLocale: false,
    },
  },

  integrations: [
    sitemap({
      i18n: {
        defaultLocale: 'es',
        locales: { es: 'es-ES', en: 'en-US' },
      },
    }),
  ],
});
