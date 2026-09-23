export interface HeroFont {
  id: string;
  label: string;
  family: string;
  file: string;
  /** Peso de la línea grande. */
  titleWeight: number;
  /** Peso de la segunda línea: más fina, como en la referencia. */
  subtitleWeight: number;
  /** Interletraje de las líneas grandes, en em. Negativo aprieta. */
  tracking: number;
  /** Corrección de tamaño: cada tipo llena el bloque de forma distinta. */
  sizeScale: number;
}

export const FONTS: HeroFont[] = [
  // Las dos que ya conocías, para poder comparar contra ellas.
  {
    id: 'geist',
    label: 'Geist',
    family: 'Geist',
    file: 'Geist.woff2',
    titleWeight: 450,
    subtitleWeight: 250,
    tracking: -0.028,
    sizeScale: 1,
  },
  {
    id: 'space',
    label: 'Space Grotesk',
    family: 'SpaceGrotesk',
    file: 'SpaceGrotesk.woff2',
    titleWeight: 500,
    subtitleWeight: 300,
    tracking: -0.032,
    sizeScale: 1,
  },

  // Nuevas.
  {
    // Lo más cercano que hay libre a una GT America. Muy neutra y muy fina
    // de dibujo; el peso 100 da una segunda línea casi de hilo.
    id: 'switzer',
    label: 'Switzer',
    family: 'Switzer',
    file: 'Switzer.woff2',
    titleWeight: 500,
    subtitleWeight: 200,
    tracking: -0.032,
    sizeScale: 1.02,
  },
  {
    // Grotesca con carácter: terminaciones cortadas en ángulo.
    id: 'instrumentsans',
    label: 'Instrument Sans',
    family: 'InstrumentSans',
    file: 'InstrumentSans.woff2',
    titleWeight: 600,
    subtitleWeight: 400,
    tracking: -0.03,
    sizeScale: 1,
  },
  {
    // Display contemporánea, bastante más personal que una grotesca neutra.
    id: 'clash',
    label: 'Clash Display',
    family: 'ClashDisplay',
    file: 'ClashDisplay.woff2',
    titleWeight: 500,
    subtitleWeight: 250,
    tracking: -0.028,
    sizeScale: 1.04,
  },
  {
    // Rarezas deliberadas en las curvas. Se nota a tamaño grande.
    id: 'funnel',
    label: 'Funnel Display',
    family: 'FunnelDisplay',
    file: 'FunnelDisplay.woff2',
    titleWeight: 500,
    subtitleWeight: 300,
    tracking: -0.03,
    sizeScale: 1.02,
  },
  {
    // Sueca, con detalles raros en la a y la g. Menos neutra de lo que parece.
    id: 'familjen',
    label: 'Familjen Grotesk',
    family: 'FamiljenGrotesk',
    file: 'FamiljenGrotesk.woff2',
    titleWeight: 600,
    subtitleWeight: 400,
    tracking: -0.028,
    sizeScale: 1.02,
  },
];

export function findFont(id: string): HeroFont {
  const found = FONTS.find((font) => font.id === id);
  if (!found) throw new Error(`Tipografía desconocida: ${id}`);
  return found;
}

/**
 * Las tres tipografías del hero. Las dos líneas grandes van por separado
 * porque no tienen por qué compartir tipo: en la referencia la segunda es
 * otra voz, no la misma más fina.
 */
export interface HeroFonts {
  title: HeroFont;
  subtitle: HeroFont;
  body: HeroFont;
}

/** La combinación elegida. */
export const HERO_FONTS: HeroFonts = {
  title: findFont('instrumentsans'),
  subtitle: findFont('clash'),
  body: findFont('clash'),
};

/** Los textos del bloque del hero, en el orden en que se leen. */
export interface HeroCopy {
  /** Etiqueta pequeña a la izquierda del filete. */
  eyebrowLeft: string;
  /** Etiqueta pequeña a la derecha del filete. */
  eyebrowRight: string;
  /** Línea grande. Acaba en punto. */
  title: string;
  /** Segunda línea grande, más fina. Mismo largo aproximado que el título. */
  subtitle: string;
  /** Párrafo con el concepto. Se parte solo en dos o tres líneas. */
  paragraph: string;
}
