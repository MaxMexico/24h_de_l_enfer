import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const SHOTS = new URL('../screenshots/', import.meta.url).pathname;
const BASE = 'http://127.0.0.1:4173/24h_de_l_enfer/';
const START = new Date(Date.now() - 3 * 3600_000);
const TEAM_ID = '11111111-1111-4111-8111-111111111111';
const R = ['22222222-2222-4222-8222-222222222221', '22222222-2222-4222-8222-222222222222',
           '22222222-2222-4222-8222-222222222223', '22222222-2222-4222-8222-222222222224'];

const team = {
  id: TEAM_ID, name: 'Les Fous du Bus', race_start: START.toISOString(),
  loop_km: 1.41, ref_pace_sec: 360, race_minutes: 1440,
  phases: [{ id: 'jour', label: 'Jour', from: 0, to: 720, mode: 'loops', loops: 3 },
           { id: 'nuit', label: 'Nuit', from: 720, to: 1200, mode: 'time', minutes: 60 },
           { id: 'finale', label: 'Finale', from: 1200, to: 1440, mode: 'loops', loops: 2 }],
};
const runners = ['Victor', 'Brunet', 'Soulard', 'Quentin'].map((name, i) => ({
  id: R[i], team_id: TEAM_ID, name, position: i + 1,
  color: ['#F2A65A', '#5BC0EB', '#E86A92', '#8FD694'][i], active: true,
  created_at: START.toISOString(), updated_at: START.toISOString(),
}));
// Une seule jambe ouverte, Victor en piste.
const legs = [{
  id: '33333333-3333-4333-8333-000000000000', team_id: TEAM_ID, runner_id: R[0],
  started_at: START.toISOString(), ended_at: null, loops: 0, note: null, deleted_at: null,
  created_at: START.toISOString(), updated_at: START.toISOString(),
}];

mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2 });

let rpcShouldFail = true;
let rpcCalls = 0;
const rpcLegIds = new Set();

await page.route('**/rest/v1/**', async (route) => {
  const req = route.request();
  const url = req.url();
  const ok = (body) => route.fulfill({
    status: 200, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body),
  });

  if (url.includes('/rpc/record_relay')) {
    rpcCalls += 1;
    const payload = JSON.parse(req.postData() ?? '{}');
    if (rpcShouldFail) return route.abort('failed');
    // Le serveur est idempotent sur p_leg_id.
    rpcLegIds.add(payload.p_leg_id);
    return ok([
      { ...legs[0], ended_at: payload.p_at, loops: payload.p_closing_loops ?? 3 },
      { id: payload.p_leg_id, team_id: TEAM_ID, runner_id: R[1], started_at: payload.p_at,
        ended_at: null, loops: 0, note: null, deleted_at: null,
        created_at: payload.p_at, updated_at: payload.p_at },
    ]);
  }
  if (url.includes('/teams')) return ok(team);
  if (url.includes('/runners')) return ok(runners);
  return ok(legs);
});
await page.route('**/realtime/**', (route) => route.abort());

await page.goto(`${BASE}#/t/fousdubus-a7f3`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);

const enPiste = () => page.locator('main .disp').first().textContent();
console.log('Avant appui        :', await enPiste());

// --- 1. Reactivite du bouton, reseau en echec ---
const t0 = Date.now();
await page.getByRole('button', { name: 'Relais', exact: true }).click();
await page.waitForFunction(
  () => document.querySelector('main .disp')?.textContent?.includes('Brunet'),
  null, { timeout: 3000 },
);
console.log('Bascule UI en      :', `${Date.now() - t0} ms  (cible < 100 ms)`);
console.log('Apres appui        :', await enPiste());

// --- 2. Double appui pendant une requete lente ---
await page.getByRole('button', { name: 'Relais', exact: true }).click();
await page.getByRole('button', { name: 'Relais', exact: true }).click();
await page.waitForTimeout(200);

// --- 3. Bandeau de relance apres les relances automatiques ---
await page.waitForSelector('[role="alert"]', { timeout: 15000 });
console.log('Bandeau d échec    : affiche');
await page.screenshot({ path: `${SHOTS}/5-echec.png` });

const badge = await page.locator('header .mono').last().textContent();
console.log('Indicateur         :', badge?.trim());

// --- 4. La relance aboutit sans doublon ---
rpcShouldFail = false;
await page.getByRole('button', { name: 'Réessayer' }).click();
await page.waitForSelector('[role="alert"]', { state: 'detached', timeout: 15000 });
await page.waitForTimeout(600);
console.log('Apres Reessayer    :', (await page.locator('header .mono').last().textContent())?.trim());
console.log('Relais distincts   :', rpcLegIds.size, '(appels HTTP :', rpcCalls, ')');
console.log('En piste final     :', await enPiste());
await page.screenshot({ path: `${SHOTS}/6-recupere.png` });

await browser.close();
