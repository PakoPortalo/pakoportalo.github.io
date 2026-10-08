/**
 * Todos los textos de la web, en español (por defecto, en la raíz) y en
 * inglés (/en). Cada componente coge los de su idioma con
 * textos(Astro.currentLocale).
 *
 * Lo que es dato (obras, biografía, servicios) vive en src/data, también
 * en los dos idiomas.
 */
export type Idioma = 'es' | 'en';

export const idioma = (locale: string | undefined): Idioma => (locale === 'en' ? 'en' : 'es');

const es = {
  html: 'es',
  meta: {
    locale: 'es_ES',
    imagen: 'og-es.jpg',
    imagenAlt: 'PAKO PORTALO. Música & Diseño sonoro.',
    rol: 'Compositor y diseñador de sonido',
    titulo: 'Pako Portalo — Composición musical y diseño sonoro',
    descripcion:
      'Composiciones originales para videojuegos y spots publicitarios, y diseño sonoro para piezas audiovisuales: del cine al teatro.',
  },
  hero: {
    eyebrowLeft: 'Composición musical',
    eyebrowRight: 'Diseño sonoro',
    title: 'Pako Portalo.',
    subtitle: 'Sound & Music.',
    paragraph:
      'Composiciones originales para videojuegos y spots publicitarios, y diseño sonoro para piezas audiovisuales: del cine al teatro.',
    sensores: 'Activar sensores',
  },
  proyectos: {
    rotulo: 'Proyectos destacados',
    cursor: 'VER',
    cerrar: 'Cerrar',
    video: 'Vídeo del proyecto',
  },
  atajo: {
    pregunta: '¿Tienes alguna pregunta?',
    respuesta: '¡Contacta aquí!',
    etiqueta: 'Contacto',
  },
  cierre: {
    pregunta: '¿Hablamos de tu proyecto?',
    respuesta: '¡Escríbeme!',
    texto:
      'Un spot, un videojuego, una película. Cuéntame la pieza y lo que buscas: te propongo varias ideas y afinamos juntos hasta el máster final.',
  },
  encargos: {
    entradilla: 'Especializado en',
  },
  creds: {
    reconocimientos: 'Reconocimientos',
    clientes: 'Clientes',
    finalista: 'Finalista',
    nominado: 'Nominado',
  },
  sobre: {
    etiqueta: 'Quién soy',
    rol: 'Interpretación y composición musical',
    alt: 'Pako Portalo tocando la guitarra en un concierto',
    trayectoria: 'Trayectoria',
  },
  tarjeta: {
    lema: 'Música & Diseño sonoro.',
    contacto: 'Contacto',
    atras: 'Atrás',
    cerrar: 'Cerrar',
    copiar: 'Copiar',
    copiado: '¡Copiado!',
  },
  pie: {
    redes: 'Redes y contacto',
    correo: 'Correo',
    otroIdioma: 'English',
    otroIdiomaRuta: 'en/',
    otroIdiomaLang: 'en',
  },
};

const en: typeof es = {
  html: 'en',
  meta: {
    locale: 'en_GB',
    imagen: 'og-en.jpg',
    imagenAlt: 'PAKO PORTALO. Music & Sound design.',
    rol: 'Composer and sound designer',
    titulo: 'Pako Portalo — Music composition and sound design',
    descripcion:
      'Original music for video games and commercials, and sound design for audiovisual work: from film to theatre.',
  },
  hero: {
    eyebrowLeft: 'Music composition',
    eyebrowRight: 'Sound design',
    title: 'Pako Portalo.',
    subtitle: 'Sound & Music.',
    paragraph:
      'Original music for video games and commercials, and sound design for audiovisual work: from film to theatre.',
    sensores: 'Enable sensors',
  },
  proyectos: {
    rotulo: 'Featured projects',
    cursor: 'VIEW',
    cerrar: 'Close',
    video: 'Project video',
  },
  atajo: {
    pregunta: 'Got a question?',
    respuesta: 'Get in touch!',
    etiqueta: 'Contact',
  },
  cierre: {
    pregunta: 'Got a project in mind?',
    respuesta: 'Write to me!',
    texto:
      'A commercial, a video game, a film. Tell me about the piece and what you are after: I will pitch you several ideas and we will fine-tune them together, all the way to the final master.',
  },
  encargos: {
    entradilla: 'Specialised in',
  },
  creds: {
    reconocimientos: 'Recognition',
    clientes: 'Clients',
    finalista: 'Shortlisted',
    nominado: 'Nominated',
  },
  sobre: {
    etiqueta: 'About',
    rol: 'Music performance and composition',
    alt: 'Pako Portalo playing the guitar at a concert',
    trayectoria: 'Career',
  },
  tarjeta: {
    lema: 'Music & Sound design.',
    contacto: 'Contact',
    atras: 'Back',
    cerrar: 'Close',
    copiar: 'Copy',
    copiado: 'Copied!',
  },
  pie: {
    redes: 'Social and contact',
    correo: 'Email',
    otroIdioma: 'Español',
    otroIdiomaRuta: '',
    otroIdiomaLang: 'es',
  },
};

export const textos = (locale: string | undefined) => (idioma(locale) === 'en' ? en : es);
