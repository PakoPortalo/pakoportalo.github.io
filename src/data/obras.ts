/**
 * Las obras que enseña la sección de proyectos, y lo que hace falta de cada
 * una para pintarla: ficha, enlace y el nombre de su clip.
 *
 * Los clips viven en /public/proyectos/clips/<slug>.{webm,mp4,webp}: el webm
 * es AV1, el mp4 es el respaldo H.264 y el webp es el póster.
 */
export interface Obra {
  /** Nombre de sus archivos en /public/proyectos/clips/. */
  slug: string;
  /** La marca va delante: es lo que reconoce quien mira, no el nombre de la pieza. */
  marca: string;
  titulo: string;
  agencia?: string;
  ano: string;
  papel: string;
  /** Id del vídeo de YouTube: el que se abre en la ventana al hacer clic. */
  youtube: string;
}

export const enlaceYouTube = (obra: Obra) => `https://www.youtube.com/watch?v=${obra.youtube}`;

export const obras: Obra[] = [
  {
    slug: 'xiaomi',
    marca: 'Xiaomi',
    titulo: 'Porque sí',
    ano: '2023',
    papel: 'Música original',
    youtube: 'J1EePtijHD0',
  },
  {
    slug: 'revelation',
    marca: 'Junta de Andalucía',
    titulo: 'The Revelation',
    agencia: 'Casanova',
    ano: '2026',
    papel: 'Diseño sonoro',
    youtube: 'PxR6Bte4JLs',
  },
  {
    slug: 'culo',
    marca: 'VivaGym',
    titulo: 'I love my culo',
    ano: '2024',
    papel: 'Dirección de sonido y producción musical',
    youtube: 'a-K3QIMliwk',
  },
  {
    slug: 'datagarden',
    marca: 'Shaman Garage',
    titulo: 'Data Garden',
    ano: '2023',
    papel: 'Diseño sonoro',
    youtube: 'L1nHJ-0tZtQ',
  },
];
