// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

/**
 * `site` debe apuntar a la URL final publicada: de ahí salen las URLs
 * canónicas y el sitemap.
 *
 * Solo en español por ahora. La versión en inglés vendrá más adelante; para
 * entonces se vuelve a añadir aquí el bloque `i18n`.
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

  integrations: [sitemap()],
});
