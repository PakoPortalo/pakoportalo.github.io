import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * Un fichero por proyecto y por idioma:
 *   src/data/sound/es/mi-proyecto.md
 *   src/data/sound/en/mi-proyecto.md
 * El id queda como "es/mi-proyecto". Mismo slug en ambos idiomas = misma obra,
 * y así el selector de idioma puede saltar a la traducción exacta.
 */
const work = z.object({
  title: z.string(),
  summary: z.string(),
  /** Qué hiciste tú: "Diseño de sonido", "Mezcla", "Composición"... */
  role: z.string().optional(),
  year: z.number().int().optional(),
  /** Solo el ID del vídeo, no la URL entera: "dQw4w9WgXcQ" */
  youtube: z.string().optional(),
  /** Ruta dentro de /public, ej "/img/obra.jpg". Si no hay, se usa la de YouTube. */
  cover: z.string().optional(),
  client: z.string().optional(),
  tags: z.array(z.string()).default([]),
  /** Enlace externo (web del proyecto, Bandcamp, Spotify...) */
  url: z.url().optional(),
  repo: z.url().optional(),
  featured: z.boolean().default(false),
  /** Menor = antes en la lista. Sin valor, ordena por año descendente. */
  order: z.number().optional(),
  draft: z.boolean().default(false),
});

const collection = (dir: string) =>
  defineCollection({
    loader: glob({ pattern: '**/*.md', base: `./src/data/${dir}` }),
    schema: work,
  });

export const collections = {
  audio: collection('audio'),
  web: collection('web'),
};
