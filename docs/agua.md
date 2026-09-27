# Agua v2 — física de fluido

Spec de la segunda versión del líquido del hero. La v1 se queda intacta y
etiquetada como `agua-v1`; esta vive aparte, en `?water=sph`.

## Por qué no vale afinar la v1

La v1 son 24 gotas con fuerzas escritas a mano: cada una persigue un punto y
**ninguna ve a las demás**. Eso basta para una mancha que se mueve, pero no
puede parecer agua, porque lo que hace que un líquido se lea como líquido son
tres cosas que ahí no existen:

- **Presión.** Se repelen al juntarse, y por eso conservan volumen en vez de
  solaparse. Es lo que hace que al inclinar se *derrame* en vez de deslizarse.
- **Tensión superficial.** Se atraen a media distancia, y por eso la
  superficie se cierra sola y se forman gotas redondas en vez de bordes
  sueltos.
- **Viscosidad.** Cada una comparte velocidad con sus vecinas, y por eso el
  movimiento se propaga por dentro en ondas en lugar de que cada parte vaya a
  lo suyo.

Y son 24. Con 24 no hay superficie que leer por buena que sea la física.

## Método

**SPH** (Müller et al. 2003) en dos dimensiones, en JavaScript. Frente a
Position Based Fluids: PBF aguanta mejor los pasos de tiempo largos, pero
necesita un solucionador de restricciones iterativo. Para doscientas
partículas en un móvil, SPH con subpasos es bastante más simple y llega igual.

Vecinos por **rejilla espacial**, no todos contra todos: con 220 partículas,
todos contra todos son 24.000 parejas por subpaso, y eso no cabe en el
presupuesto de un móvil.

## El cambio que obliga en el dibujo

Hoy las gotas van como parámetros sueltos del shader y el campo se evalúa
recorriéndolas **en cada píxel**. Con 24 sale; con 220 son 220 evaluaciones
por píxel y no hay móvil que lo aguante.

La v2 cambia a **salpicado**: cada partícula se pinta como un cuadradito con
mezcla aditiva sobre una textura de campo a resolución baja, y el sombreado
—refracción, dispersión, brillos— se aplica después leyendo esa textura. El
coste pasa a ser proporcional al número de partículas y no al de píxeles.

Lo que se pierde: el gradiente analítico. Ahora la normal se saca de cuatro
lecturas vecinas de la textura del campo, lo cual es más barato pero algo más
blando. **Puede que la estética cambie ligeramente**, y la estética es lo que
sí te gusta de la v1. Es el riesgo principal de esta versión.

## Parámetros

Los que se van a poder tocar desde fuera, con su valor de salida:

| Parámetro | Salida | Qué hace |
|---|---|---|
| `particles` | 200 móvil / 300 escritorio | Cuántas partículas |
| `stiffness` | 900 | Presión. Alto = incompresible y nervioso |
| `restDensity` | 1000 | Densidad de reposo, fija la separación |
| `viscosity` | 0.18 | Espesor. Alto = miel, bajo = agua |
| `surfaceTension` | 0.08 | Cuánto se cierra la superficie |
| `gravity` | 9.8 × inclinación | Del giroscopio |
| `wallDamping` | 0.35 | Cuánta velocidad se pierde al chocar |
| `substeps` | 3 | Subpasos por fotograma |

## Contrato de comportamiento

Lo que tiene que cumplir para darla por buena:

- **Responde ya.** El primer movimiento visible, por debajo de 100 ms desde
  que empieza a girar el móvil.
- **Se coloca rápido.** Tras un giro de 6 grados, la masa llega a su nuevo
  sitio en 0,4–0,7 s.
- **Chapotea.** Uno o dos vaivenes visibles al enderezar, muertos antes del
  segundo y medio.
- **Un gesto pequeño rinde.** Seis grados mueven el grueso del agua al menos
  un 40 % del ancho.
- **Va fluida.** 60 fotogramas por segundo en un móvil de gama media, con
  degradado del número de partículas si no llega.
- **Se lee el texto.** Ver abajo.

## Decisión pendiente: dónde está el suelo

Con física de verdad, la gravedad lleva el agua abajo — justo donde está el
bloque de texto. En la v1 esto se resolvía con un empuje hacia arriba que
funcionaba porque las fuerzas eran inventadas; con un fluido de verdad, una
mano invisible sujetando el agua se nota.

La propuesta: **el suelo del recipiente es el borde superior del bloque de
texto**. El agua vive en la franja de arriba y el texto queda fuera del vaso.
Es coherente —el vaso se apoya sobre el rótulo— y no hace falta ninguna
fuerza falsa.

La alternativa sería dejarla caer encima del texto y asumir que a ratos tapa.

## Referencias

- [Implementing SPH in 2D — Lucas V. Schuermann](https://lucasschuermann.com/writing/implementing-sph-in-2d) — el tutorial base, con las tres fuerzas y sus núcleos
- [tizian/SPH-Water-Simulation](https://github.com/tizian/SPH-Water-Simulation) — implementación 2D legible, buena para contrastar constantes
- [asadm/SPHjs](https://github.com/asadm/SPHjs) — SPH en JavaScript puro pensado para móvil
- [Müller et al., SPH para shallow water](https://matthias-research.github.io/pages/publications/SPHShallow.pdf) — del autor del método original
- [xuxmin/pbf](https://github.com/xuxmin/pbf) — PBF en WebGL con render de superficie; la alternativa descartada, por si hay que volver
- [2D Fluid Simulation in Javascript and WebGL](https://p.brm.sk/fluid/) — referencia de rendimiento en navegador
