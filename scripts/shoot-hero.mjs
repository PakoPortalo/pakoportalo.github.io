/**
 * Captura el hero en sus tres temas contra el servidor de previsualización.
 * Sirve para comprobar que el 3D realmente se dibuja, no solo que compila.
 *
 *   npm run build && npx astro preview --port 4399 &
 *   node scripts/shoot-hero.mjs <carpeta-destino>
 */
import { chromium } from 'playwright';

const outDir = process.argv[2] ?? '.';
const base = process.env.PREVIEW_URL ?? 'http://localhost:4399';

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const problems = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') problems.push(`console: ${msg.text()}`);
});
page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));

await page.goto(base, { waitUntil: 'networkidle' });

// El hero solo se marca 3D cuando WebGL arrancó de verdad.
await page.waitForSelector('.hero--3d', { timeout: 20000 });
console.log('✓ .hero--3d activo — WebGL arrancó');

const pickerVisible = await page.isVisible('[data-hero-picker]');
console.log(`✓ selector de tema visible: ${pickerVisible}`);

for (const theme of ['avant', 'heat', 'techno', 'gran', 'zerk']) {
  await page.click(`[data-hero-picker] input[value="${theme}"]`);
  await page.waitForFunction(
    (t) => document.querySelector('[data-hero]')?.getAttribute('data-hero-theme') === t,
    theme,
  );
  await page.waitForTimeout(900);

  // No se puede leer el búfer de WebGL desde fuera: sin preserveDrawingBuffer
  // se limpia al componer y readPixels siempre devolvería vacío. Como medida
  // indirecta usamos el peso del PNG: una imagen plana comprime a nada.
  const shot = await page.screenshot({ path: `${outDir}/hero-${theme}.png` });
  const kb = Math.round(shot.byteLength / 1024);
  console.log(`  ${theme.padEnd(6)} captura ${kb} KB`);
  if (kb < 40) {
    problems.push(`${theme}: la captura pesa ${kb} KB, el hero parece vacío`);
  }

}

// El ratón debe mover la escena.
await page.click('[data-hero-picker] input[value="avant"]');
await page.waitForTimeout(600);
await page.mouse.move(200, 300);
await page.waitForTimeout(700);
await page.screenshot({ path: `${outDir}/hero-mouse-left.png` });
await page.mouse.move(1240, 600);
await page.waitForTimeout(700);
await page.screenshot({ path: `${outDir}/hero-mouse-right.png` });

await browser.close();

if (problems.length) {
  console.log('\nPROBLEMAS:');
  problems.forEach((p) => console.log(' -', p));
  process.exit(1);
}
console.log('\nOK — hero dibujando en los tres temas');
