/**
 * Captura el hero líquido en varios momentos y posiciones del cursor.
 *   node scripts/shoot-liquid.mjs <carpeta>
 */
import { chromium } from 'playwright';

const out = process.argv[2] ?? '.';
const base = process.env.PREVIEW_URL ?? 'http://localhost:4399';

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const problems = [];
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

await page.goto(`${base}/liquid/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.hero.is-live', { timeout: 25000 });
console.log('✓ hero activo (WebGL2 arrancó)');

// Pasea el cursor para que el chorro se estire, y captura por el camino.
const path = [[300, 300], [800, 420], [1100, 620], [500, 700]];
for (let i = 0; i < path.length; i += 1) {
  await page.mouse.move(path[i][0], path[i][1], { steps: 24 });
  await page.waitForTimeout(700);
  const shot = await page.screenshot({ path: `${out}/liquid-${i + 1}.png` });
  console.log(`  captura ${i + 1}: ${Math.round(shot.byteLength / 1024)} KB`);
}

await browser.close();
if (problems.length) { console.log('\nPROBLEMAS:'); problems.forEach(p => console.log(' -', p)); process.exit(1); }
console.log('\nOK');
