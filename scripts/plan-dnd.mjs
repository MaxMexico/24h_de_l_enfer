import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const SHOTS = new URL('../screenshots/', import.meta.url).pathname;
const BASE = 'http://127.0.0.1:4173/24h_de_l_enfer/';
// Supabase est bouchonne : n'importe quel code fait l'affaire.
const CODE = process.env.TEAM_CODE ?? 'code-de-test';
const START = new Date(Date.now() - 3 * 3600_000);
const TEAM_ID = '11111111-1111-4111-8111-111111111111';
const R = ['22222222-2222-4222-8222-222222222221', '22222222-2222-4222-8222-222222222222',
           '22222222-2222-4222-8222-222222222223', '22222222-2222-4222-8222-222222222224'];
const NAMES = ['Victor', 'Brunet', 'Soulard', 'Quentin'];

const team = {
  id: TEAM_ID, name: 'Les Fous du Bus', race_start: START.toISOString(),
  loop_km: 1.41, ref_pace_sec: 360, race_minutes: 1440, plan: [],
  phases: [{ id: 'jour', label: 'Jour', from: 0, to: 720, mode: 'loops', loops: 3 },
           { id: 'nuit', label: 'Nuit', from: 720, to: 1200, mode: 'time', minutes: 60 },
           { id: 'finale', label: 'Finale', from: 1200, to: 1440, mode: 'loops', loops: 2 }],
};
const runners = NAMES.map((name, i) => ({
  id: R[i], team_id: TEAM_ID, name, position: i + 1,
  color: ['#F2A65A', '#5BC0EB', '#E86A92', '#8FD694'][i], active: true,
  created_at: START.toISOString(), updated_at: START.toISOString(),
}));
const legs = [{
  id: '33333333-3333-4333-8333-000000000000', team_id: TEAM_ID, runner_id: R[0],
  started_at: START.toISOString(), ended_at: null, loops: 0, planned_loops: null,
  note: null, deleted_at: null,
  created_at: START.toISOString(), updated_at: START.toISOString(),
}];

mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2 });

await page.route('**/rest/v1/**', async (route) => {
  const req = route.request();
  const url = req.url();
  const ok = (b) => route.fulfill({ status: 200, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });

  if (url.includes('/teams') && req.method() === 'PATCH') {
    Object.assign(team, JSON.parse(req.postData() ?? '{}'));
    return ok([team]);
  }
  if (url.includes('/runners') && req.method() === 'PATCH') {
    const patch = JSON.parse(req.postData() ?? '{}');
    const m = /id=eq\.([0-9a-f-]+)/.exec(url);
    const t = runners.find((r) => r.id === m?.[1]);
    if (t) Object.assign(t, patch);
    return ok([t ?? null]);
  }
  if (url.includes('/teams')) return ok(team);
  if (url.includes('/runners')) return ok(runners);
  return ok(legs);
});
await page.route('**/realtime/**', (route) => route.abort());

await page.goto(`${BASE}#/t/${CODE}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await page.getByRole('button', { name: 'Victor' }).first().click();
await page.waitForTimeout(300);

/* ---------------- planification de plusieurs relais ---------------- */
await page.getByRole('button', { name: 'Rotation' }).click();
await page.waitForTimeout(400);

const planButtons = page.getByRole('button', { name: 'Planifier ce relais' });
console.log('1. Creneaux planifiables :', await planButtons.count(), '(horizon 8)');

// 2e créneau à venir : on impose Quentin.
await planButtons.nth(1).click();
await page.waitForTimeout(250);
await page.locator('main').getByRole('button', { name: 'Quentin' }).first().click();
await page.waitForTimeout(400);
console.log('2. Consigne posee rang 2 :', JSON.stringify(team.plan));

// On referme avant d'ouvrir le suivant, sinon deux editeurs coexistent.
await page.getByRole('button', { name: 'Fermer' }).first().click();
await page.waitForTimeout(250);

// 4e créneau : 5 boucles.
await page.getByRole('button', { name: 'Planifier ce relais' }).nth(3).click();
await page.waitForTimeout(250);
await page.locator('main').getByRole('button', { name: 'Une boucle de plus' }).first().click();
await page.waitForTimeout(200);
await page.locator('main').getByRole('button', { name: 'Une boucle de plus' }).first().click();
await page.waitForTimeout(400);
console.log('3. File complete         :', JSON.stringify(team.plan));
const marks = await page.locator('main').getByText('imposé').count();
console.log('3. Creneaux marques      :', marks, marks === 2 ? '(2 attendus)' : '*** ATTENDU 2 ***');
await page.screenshot({ path: `${SHOTS}/11-planification.png` });

/* ---------------------------- drag & drop ---------------------------- */
await page.getByRole('button', { name: 'Équipe' }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Réglages' }).click();
await page.waitForTimeout(400);

const order = async () =>
  (await page.locator('input[aria-label^="Nom du coureur"]').all())
    .reduce(async (acc, el) => [...(await acc), await el.inputValue()], Promise.resolve([]));

console.log('4. Ordre initial         :', (await order()).join(' > '));

// On tire la poignée de Quentin (4e) jusqu'en tête.
const handles = page.locator('span[style*="grab"], span[style*="touch-action"]');
const from = await handles.nth(3).boundingBox();
const to = await handles.nth(0).boundingBox();
await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
await page.mouse.down();
// Plusieurs pas : un seul saut ne declenche pas de pointermove intermediaire.
for (let i = 1; i <= 6; i += 1) {
  await page.mouse.move(from.x + from.width / 2,
    from.y + from.height / 2 + ((to.y - from.y) * i) / 6);
  await page.waitForTimeout(30);
}
await page.mouse.up();
await page.waitForTimeout(400);

const after = await order();
console.log('5. Apres glissement      :', after.join(' > '),
  after[0] === 'Quentin' ? '(Quentin en tete)' : '*** DEPLACEMENT RATE ***');

await page.getByRole('button', { name: 'Enregistrer la rotation' }).click();
await page.waitForTimeout(600);
const saved = [...runners].sort((a, b) => a.position - b.position).map((r) => r.name);
console.log('6. Ordre enregistre      :', saved.join(' > '),
  saved[0] === 'Quentin' ? '(persiste)' : '*** NON PERSISTE ***');
await page.screenshot({ path: `${SHOTS}/12-drag-drop.png` });

await browser.close();
