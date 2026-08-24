import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const SHOTS = new URL('../screenshots/', import.meta.url).pathname;
const BASE = 'http://127.0.0.1:4173/24h_de_l_enfer/';

// Depart fictif : il y a 3 h pour une course en cours, 25 h avec
// FINISHED=1 pour verifier le bilan de fin.
const FINISHED = process.env.FINISHED === '1';
const START = new Date(Date.now() - (FINISHED ? 25 : 3) * 3600_000);
const TEAM_ID = '11111111-1111-4111-8111-111111111111';
const R = {
  v: '22222222-2222-4222-8222-222222222221',
  b: '22222222-2222-4222-8222-222222222222',
  s: '22222222-2222-4222-8222-222222222223',
  q: '22222222-2222-4222-8222-222222222224',
};

const team = [{
  id: TEAM_ID, name: 'Les Fous du Bus',
  race_start: START.toISOString(), loop_km: 1.41, ref_pace_sec: 360,
  race_minutes: 1440, plan: [],
  phases: [
    { id: 'jour', label: 'Jour', from: 0, to: 720, mode: 'loops', loops: 3 },
    { id: 'nuit', label: 'Nuit', from: 720, to: 1200, mode: 'time', minutes: 60 },
    { id: 'finale', label: 'Finale', from: 1200, to: 1440, mode: 'loops', loops: 2 },
  ],
}];

const runners = [
  ['Victor', 1, '#F2A65A', R.v], ['Brunet', 2, '#5BC0EB', R.b],
  ['Soulard', 3, '#E86A92', R.s], ['Quentin', 4, '#8FD694', R.q],
].map(([name, position, color, id]) => ({
  id, team_id: TEAM_ID, name, position, color, active: true,
  created_at: START.toISOString(), updated_at: START.toISOString(),
}));

// Huit relais boucles puis un neuvieme en cours.
const legs = [];
let t = START.getTime();
const order = [R.v, R.b, R.s, R.q];
for (let i = 0; i < (FINISHED ? 60 : 8); i += 1) {
  const dur = (20 + (i % 3)) * 60_000;
  legs.push({
    id: `33333333-3333-4333-8333-${String(i).padStart(12, '0')}`,
    team_id: TEAM_ID, runner_id: order[i % 4],
    started_at: new Date(t).toISOString(),
    ended_at: new Date(t + dur).toISOString(),
    loops: 3, planned_loops: null, note: null, deleted_at: null,
    created_at: new Date(t).toISOString(), updated_at: new Date(t).toISOString(),
  });
  t += dur;
}
if (!FINISHED) legs.push({
  id: '33333333-3333-4333-8333-000000000008',
  team_id: TEAM_ID, runner_id: order[8 % 4],
  started_at: new Date(t).toISOString(), ended_at: null,
  loops: 0, planned_loops: null, note: null, deleted_at: null,
  created_at: new Date(t).toISOString(), updated_at: new Date(t).toISOString(),
});

mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2 });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.route('**/rest/v1/**', async (route) => {
  const url = route.request().url();
  const body = url.includes('/teams') ? team : url.includes('/runners') ? runners : legs;
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(url.includes('/teams') ? body[0] : body),
  });
});
await page.route('**/realtime/**', (route) => route.abort());

await page.goto(`${BASE}#/t/fousdubus-a7f3`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);

const shot = async (name) => {
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
  console.log('  ->', name);
};

await shot(FINISHED ? '8-bilan' : '1-course');
if (FINISHED) { await page.mouse.wheel(0, 1400); await page.waitForTimeout(400); await shot('8-bilan'); }
console.log('En piste :', await page.locator('.disp').last().textContent());

await page.getByRole('button', { name: 'Rotation' }).click();
await page.waitForTimeout(400);
await shot('2-rotation');

await page.getByRole('button', { name: 'Équipe' }).click();
await page.waitForTimeout(400);
await shot('3-equipe');

await page.getByRole('button', { name: 'Réglages' }).click();
await page.waitForTimeout(400);
await shot('4-reglages');

console.log('\nErreurs console :', errors.length ? errors : 'aucune');
await browser.close();
