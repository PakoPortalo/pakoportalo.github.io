/**
 * Lo que se le puede encargar: el módulo que va después del atajo a
 * contacto. Dos servicios; en cada uno, el tramo final (para quién) se
 * enciende en uno de los dos colores de los puntos del hero.
 */
export const entradilla = 'Especializado en';

export interface Servicio {
  /** La frase completa, tal cual se lee. */
  texto: string;
  /** El final de la frase que va en color. Tiene que coincidir letra a letra. */
  acento: string;
  color: 'verde' | 'morado';
}

export const servicios: Servicio[] = [
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
