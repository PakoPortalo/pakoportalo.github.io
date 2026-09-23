# Pako Portalo — portfolio

Sitio estático bilingüe (ES/EN) en [Astro](https://astro.build). Sin backend.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor local en http://localhost:4321 |
| `npm run build` | Genera el sitio en `dist/` |
| `npm run preview` | Sirve `dist/` para revisarlo antes de publicar |
| `npx astro check` | Comprueba tipos y errores en los `.astro` |

## Añadir un trabajo

Cada trabajo es un fichero Markdown. La carpeta decide el área y el idioma:

```
src/data/
  sound/   es/mi-proyecto.md    en/mi-proyecto.md
  music/   es/…                 en/…
  dev/     es/…                 en/…
```

**El nombre del fichero es el slug de la URL.** Usa el mismo nombre en `es/` y
en `en/` para la misma obra: así el selector de idioma salta directamente a la
traducción. Si solo existe en un idioma, el selector lleva al índice del área.

### Campos del frontmatter

```yaml
---
title: "Título del trabajo"          # obligatorio
summary: "Una o dos frases."          # obligatorio
role: "Diseño de sonido y mezcla"     # opcional
year: 2025                            # opcional
youtube: "dQw4w9WgXcQ"                # opcional, SOLO el id del vídeo
cover: "/img/portada.jpg"             # opcional, fichero dentro de public/
client: "Nombre del cliente"          # opcional
tags: ["Cine", "Foley"]               # opcional
url: "https://…"                      # opcional, enlace al proyecto
repo: "https://github.com/…"          # opcional, código fuente
featured: true                        # opcional, lo saca en la portada
order: 1                              # opcional, menor = antes
draft: true                           # opcional, oculto en producción
---

Aquí va el texto largo, en Markdown normal.
```

La portada de la tarjeta sale de `cover`; si no hay, de la miniatura de
YouTube; si tampoco, de un fondo neutro.

### Sobre los vídeos

El campo `youtube` lleva **solo el id**, no la URL entera. De
`https://www.youtube.com/watch?v=dQw4w9WgXcQ` el id es `dQw4w9WgXcQ`.

El reproductor es una fachada: hasta que no pulsas Play no se carga nada de
YouTube (ni iframe, ni cookies, ni su reproductor). Solo se ve la miniatura.

## Textos de la interfaz

Menús, botones y etiquetas están en [`src/i18n/ui.ts`](src/i18n/ui.ts), no
repartidos por las plantillas. Si añades una clave al objeto `es`, TypeScript
obliga a añadirla también al `en`.

Los nombres de las secciones en la URL (`/sonido/` ↔ `/en/sound/`) están en
[`src/i18n/config.ts`](src/i18n/config.ts).

## Estructura de URLs

Español en la raíz, inglés bajo `/en/`:

```
/                     /en/
/sonido/              /en/sound/
/musica/              /en/music/
/desarrollo/          /en/development/
```

## Publicar

`.github/workflows/deploy.yml` despliega solo en cada push a `main`. Para
activarlo: en el repo de GitHub, **Settings → Pages → Source: GitHub Actions**.

Antes del primer despliegue, revisa `site` y `base` en
[`astro.config.mjs`](astro.config.mjs):

- Repo llamado `pakoportalo.github.io`, o dominio propio → `base` comentado.
- Repo con otro nombre → descomenta `base` y pon `/nombre-del-repo`.
