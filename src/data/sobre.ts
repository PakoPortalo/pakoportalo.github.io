/**
 * La biografía de "Quién soy". Dos marcas: **así** va resaltado en blanco,
 * y {verde:así} o {morado:así} en el color del punto de ese premio en
 * Reconocimientos. El resto, en gris.
 */
const biografiaEs: { tema: string; texto: string }[] = [
  {
    tema: 'Publicidad',
    texto:
      'En publicidad ha puesto sonido a spots para **Xiaomi** o **Red Bull**. Su diseño sonoro para **The Revelation of the Andalusian Crush** entró en la {verde:lista corta del Festival El Sol 2026}, en la categoría Sound Design.',
  },
  {
    tema: 'Videojuegos',
    texto:
      'Director de sonido de **Shaman Garage**, Países Bajos, ha compuesto bandas sonoras para diferentes proyectos, entre ellos **Data Garden**, nominado a {morado:Best Debut Game en los Dutch Game Awards 2024}, y ha llevado su trabajo a festivales como **A MAZE** (Alemania), **Overkill** (Países Bajos), **Playtopia** (Sudáfrica) y **Now Play This** (Inglaterra).',
  },
  {
    tema: 'Escenario',
    texto:
      'Formado en **música clásica** con el violín y en **jazz** con la guitarra, ha pasado por multitud de estilos e instrumentos y ha dado conciertos por toda **España**, **Francia**, **Inglaterra**, **Italia** o **Israel**, entre otros países.',
  },
];

const biografiaEn: { tema: string; texto: string }[] = [
  {
    tema: 'Advertising',
    texto:
      'In advertising he has created the sound for spots for **Xiaomi** and **Red Bull**. His sound design for **The Revelation of the Andalusian Crush** made the {verde:shortlist at Festival El Sol 2026}, in the Sound Design category.',
  },
  {
    tema: 'Video games',
    texto:
      'Sound director at **Shaman Garage** (Netherlands), he has composed soundtracks for several projects, including **Data Garden**, nominated for {morado:Best Debut Game at the Dutch Game Awards 2024}, and has taken his work to festivals such as **A MAZE** (Germany), **Overkill** (Netherlands), **Playtopia** (South Africa) and **Now Play This** (England).',
  },
  {
    tema: 'Stage',
    texto:
      'Trained in **classical music** on the violin and in **jazz** on the guitar, he has played across many styles and instruments and given concerts in **Spain**, **France**, **England**, **Italy** and **Israel**, among other countries.',
  },
];

/** La biografía en el idioma de la página. */
export const biografia = (lang: 'es' | 'en') => (lang === 'en' ? biografiaEn : biografiaEs);

export type Tono = 'blanco' | 'verde' | 'morado' | undefined;

/** Parte un párrafo en trozos con su tono. */
export const trozos = (texto: string) =>
  Array.from(texto.matchAll(/\*\*(.+?)\*\*|\{(verde|morado):(.+?)\}|([^*{]+)/g)).map((m) => ({
    texto: m[1] ?? m[3] ?? m[4] ?? '',
    tono: (m[1] ? 'blanco' : m[2]) as Tono,
  }));

/**
 * El texto partido en palabras para animarlas una a una. Cada palabra es
 * una lista de piezas con su tono: así la puntuación pegada a un
 * resaltado ("Red Bull.") va en la misma palabra y no salta de línea sola.
 */
export const palabras = (texto: string) => {
  const grupos: { texto: string; tono: Tono }[][] = [];
  let nueva = true;
  for (const t of trozos(texto)) {
    for (const parte of t.texto.split(/(\s+)/)) {
      if (parte === '') continue;
      if (/^\s+$/.test(parte)) {
        nueva = true;
        continue;
      }
      if (nueva) grupos.push([]);
      grupos[grupos.length - 1]!.push({ texto: parte, tono: t.tono });
      nueva = false;
    }
  }
  return grupos;
};
