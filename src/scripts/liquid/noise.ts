/**
 * Ruido de valor y campo curl para mover el líquido.
 *
 * El curl de un campo de ruido no tiene divergencia: las gotas giran y se
 * arrastran unas a otras en remolinos, sin acumularse ni desaparecer. Es lo
 * que distingue un movimiento que parece fluido de uno que parece un péndulo.
 */

function hash(x: number, y: number): number {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

export function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);

  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);

  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

export function fbm(x: number, y: number, octaves = 3): number {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let i = 0; i < octaves; i += 1) {
    sum += amplitude * valueNoise(x * frequency, y * frequency);
    frequency *= 2.03;
    amplitude *= 0.5;
  }
  return sum;
}

/** Velocidad en (x, y) para un instante dado. Devuelve [vx, vy]. */
export function curl(x: number, y: number, time: number): [number, number] {
  const e = 0.12;
  const t = time * 0.17;

  const n1 = fbm(x, y + e + t);
  const n2 = fbm(x, y - e + t);
  const n3 = fbm(x + e, y + t);
  const n4 = fbm(x - e, y + t);

  return [(n1 - n2) / (2 * e), -(n3 - n4) / (2 * e)];
}
