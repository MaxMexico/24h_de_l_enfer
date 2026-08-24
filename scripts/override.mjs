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

const team = {
  id: TEAM_ID, name: 'Les Fous du Bus', race_start: START.toISOString(),
  loop_km: 1.41, ref_pace_sec: 360, race_minutes: 1440,
  plan: [],
  phases: [{ id: 'jour', label: 'Jour', from: 0, to: 720, mode: 'loops', loops: 3 },
           { id: 'nuit', label: 'Nuit', from: 720, to: 1200, mode: 'time', minutes: 60 },
           { id: 'finale', label: 'Finale', from: 1200, to: 1440, mode: 'loops', loops: 2 }],
};
const runners = ['Victor', 'Brunet', 'Soulard', 'Quentin'].map((name, i) => ({
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
  const ok = (body) => route.fulfill({
    status: 200, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body),
  });

  if (url.includes('/rpc/record_relay')) {
    const p = JSON.parse(req.postData() ?? '{}');
    // Le faux serveur applique la consigne, comme record_relay le fait.
    const head = team.plan[0] ?? {};
    const runnerId = head.runnerId ?? R[1];
    const planned = head.loops ?? null;
    team.plan = team.plan.slice(1);
    legs[0] = { ...legs[0], ended_at: p.p_at, loops: p.p_closing_loops ?? 3 };
    legs.push({ id: p.p_leg_id, team_id: TEAM_ID, runner_id: runnerId, started_at: p.p_at,
      ended_at: null, loops: 0, planned_loops: planned, note: null, deleted_at: null,
      created_at: p.p_at, updated_at: p.p_at });
    return ok(legs);
  }
  if (url.includes('/teams') && req.method() === 'PATCH') {
    Object.assign(team, JSON.parse(req.postData() ?? '{}'));
    return ok([team]);
  }
  if (url.includes('/teams')) return ok(team);
  if (url.includes('/runners')) return ok(runners);
  if (url.includes('/legs') && req.method() === 'PATCH') {
    const patch = JSON.parse(req.postData() ?? '{}');
    const m = /id=eq\.([0-9a-f-]+)/.exec(url);
    const target = legs.find((l) => l.id === m?.[1]);
    if (target) Object.assign(target, patch);
    return ok([target ?? null]);
  }
  return ok(legs);
});
await page.route('**/realtime/**', (route) => route.abort());

await page.goto(`${BASE}#/t/${CODE}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await page.getByRole('button', { name: 'Victor' }).first().click();
await page.waitForTimeout(300);

const nextLine = () => page.locator('main').getByText(/^Ensuite ·/).textContent();
console.log('1. Prochain par defaut :', (await nextLine())?.trim());

// --- Imposer Quentin au prochain relais ---
await page.getByRole('button', { name: 'Changer le prochain relais' }).click();
await page.waitForTimeout(250);
await page.locator('main').getByRole('button', { name: 'Quentin' }).first().click();
await page.waitForTimeout(400);
console.log('2. Apres consigne      :', (await nextLine())?.trim());
const badge = await page.locator('main').getByText('imposé').count();
console.log('2. Marque « imposé »   :', badge > 0 ? 'affichee' : '*** ABSENTE ***');

// --- Reduire a 2 boucles ---
await page.getByRole('button', { name: 'Une boucle de moins' }).click();
await page.waitForTimeout(400);
console.log('3. Boucles imposees    :', team.plan[0]?.loops, team.plan[0]?.loops === 2 ? '(2 boucles)' : '*** ATTENDU 2 ***');

await page.screenshot({ path: `${SHOTS}/9-consigne.png` });

// --- Le relais applique la consigne ---
await page.getByRole('button', { name: 'Relais', exact: true }).click();
await page.waitForTimeout(900);
const live = await page.locator('main .disp').first().textContent();
console.log('4. En piste apres relais:', live, live === 'Quentin' ? '(consigne appliquee)' : '*** IGNOREE ***');
const target = await page.locator('main .mono.text-2xl').textContent();
console.log('4. Compteur / cible    :', target?.trim(), target?.includes('/2') ? '(cible 2)' : '*** CIBLE PERDUE ***');

// --- La consigne ne vaut qu'une fois ---
console.log('5. Consigne restante   :', team.plan.length === 0 ? 'effacee' : '*** RESTANTE ***');
console.log('5. Prochain suivant    :', (await nextLine())?.trim());

// --- Changer le coureur d un relais passe, depuis Rotation ---
await page.getByRole('button', { name: 'Rotation' }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Changer le coureur' }).first().click();
await page.waitForTimeout(300);
await page.locator('main').getByRole('button', { name: 'Soulard' }).first().click();
await page.waitForTimeout(500);
console.log('6. Relais passe corrige:', legs[0].runner_id === R[2] ? 'Soulard (OK)' : '*** NON APPLIQUE ***');
await page.screenshot({ path: `${SHOTS}/10-rotation-edition.png` });

await browser.close();
