/**
 * Lo que se le puede encargar: el módulo que va después del atajo a
 * contacto. Dos servicios; en cada uno, el tramo final (para quién) se
 * enciende en uno de los dos colores de los puntos del hero.
 */

export interface Servicio {
  /** La frase completa, tal cual se lee. */
  texto: string;
  /** El final de la frase que va en color. Tiene que coincidir letra a letra. */
  acento: string;
  color: 'verde' | 'morado';
}

const serviciosEs: Servicio[] = [
  {
    texto: 'Música original para spots publicitarios',
    acento: 'spots publicitarios',
    color: 'morado',
  },
  {
    texto: 'Bandas sonoras, diseño sonoro y sound FX para videojuegos y cine',
    acento: 'videojuegos y cine',
    color: 'verde',
  },
];

const serviciosEn: Servicio[] = [
  {
    texto: 'Original music for commercials',
    acento: 'commercials',
    color: 'morado',
  },
  {
    texto: 'Scores, sound design and sound FX for video games and film',
    acento: 'video games and film',
    color: 'verde',
  },
];

/** Los servicios en el idioma de la página. */
export const servicios = (lang: 'es' | 'en') => (lang === 'en' ? serviciosEn : serviciosEs);
