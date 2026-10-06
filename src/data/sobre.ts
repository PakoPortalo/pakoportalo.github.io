/**
 * La biografía de "Quién soy". Dos marcas: **así** va resaltado en blanco,
 * y {verde:así} o {morado:así} en el color del punto de ese premio en
 * Reconocimientos. El resto, en gris.
 */
export const biografia: { tema: string; texto: string }[] = [
  {
    tema: 'Formación',
    texto:
      'Formado en música clásica con el violín y en jazz con la guitarra, ha pasado por multitud de estilos e instrumentos y ha dado conciertos por toda Europa con distintos proyectos.',
  },
  {
    tema: 'Videojuegos',
    texto:
      'Director de sonido de **Shaman Garage**, Países Bajos, ha compuesto bandas sonoras para diferentes proyectos, entre ellos **Data Garden**, nominado a {morado:Best Debut Game en los Dutch Game Awards 2024}, y ha llevado su trabajo a festivales como **A MAZE** (Alemania), **Overkill** (Países Bajos), **Playtopia** (Sudáfrica) y **Now Play This** (Inglaterra).',
  },
  {
    tema: 'Publicidad',
    texto:
      'En publicidad ha puesto sonido a spots para **Xiaomi** o **Red Bull**. Su diseño sonoro para **The Revelation of the Andalusian Crush** entró en la {verde:lista corta del Festival El Sol 2026}, en la categoría Sound Design.',
  },
];

export type Tono = 'blanco' | 'verde' | 'morado' | undefined;

/** Parte un párrafo en trozos con su tono. */
export const trozos = (texto: string) =>
  Array.from(texto.matchAll(/\*\*(.+?)\*\*|\{(verde|morado):(.+?)\}|([^*{]+)/g)).map((m) => ({
    texto: m[1] ?? m[3] ?? m[4] ?? '',
    tono: (m[1] ? 'blanco' : m[2]) as Tono,
  }));
