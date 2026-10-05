# Pako Portalo — portfolio

Portfolio de composición musical y diseño sonoro, en [Astro](https://astro.build).
Sitio estático, sin backend. De momento solo en español.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor local en http://localhost:4321 |
| `npm run build` | Genera el sitio en `dist/` |
| `npm run preview` | Sirve `dist/` para revisarlo antes de publicar |
| `npx astro check` | Comprueba tipos y errores en los `.astro` |

## Páginas

| Ruta | Fichero |
| --- | --- |
| `/` | `src/pages/index.astro` — la portada, hecha de módulos |
| `/contacto/` | `src/pages/contacto.astro` |
| 404 | `src/pages/404.astro` |

La portada, de arriba abajo: `HeroLiquid` → `ProyectosRecorrido` →
`ContactoAtajo` → `Encargos` → `Credenciales` → `ContactoAtajo` (cierre).

## Contenido

- **Proyectos destacados**: `src/data/obras.ts`. Cada obra lleva marca,
  título, año, papel y el id de YouTube (solo el id, no la URL).
- **Clips de los proyectos**: `public/proyectos/clips/<slug>.{webm,mp4,webp}`
  — AV1, respaldo H.264 y póster. El `slug` es el de `obras.ts`.
- **Especializado en**: `src/data/encargos.ts`.
- **Clientes y reconocimientos**: dentro de `src/components/Credenciales.astro`;
  los logotipos, en `public/logos/`.

## Publicar

`.github/workflows/deploy.yml` despliega solo en cada push a `main`, en
GitHub Pages (`pakoportalo.github.io`).

Si el repositorio cambiara de nombre, revisa `site` y `base` en
[`astro.config.mjs`](astro.config.mjs).
