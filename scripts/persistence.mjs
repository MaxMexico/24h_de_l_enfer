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
// Victor est en piste depuis le depart : le garde-fou des 15 s ne gene pas.
const legs = [{
  id: '33333333-3333-4333-8333-000000000000', team_id: TEAM_ID, runner_id: R[0],
  started_at: START.toISOString(), ended_at: null, loops: 0, planned_loops: null, note: null, deleted_at: null,
  created_at: START.toISOString(), updated_at: START.toISOString(),
}];

mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2 });

let rpcShouldFail = true;
const relayedLegIds = new Set();

await page.route('**/rest/v1/**', async (route) => {
  const req = route.request();
  const url = req.url();
  const ok = (body) => route.fulfill({
    status: 200, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body),
  });
  if (url.includes('/rpc/record_relay')) {
    if (rpcShouldFail) return route.abort('failed');
    const p = JSON.parse(req.postData() ?? '{}');
    relayedLegIds.add(p.p_leg_id);
    // Le faux serveur garde son etat, sinon la relecture qui suit le
    // relais renverrait des lignes perimees.
    legs[0] = { ...legs[0], ended_at: p.p_at, loops: p.p_closing_loops ?? 3 };
    if (!legs.some((l) => l.id === p.p_leg_id)) {
      legs.push({ id: p.p_leg_id, team_id: TEAM_ID, runner_id: R[1], started_at: p.p_at,
        ended_at: null, loops: 0, planned_loops: null, note: null, deleted_at: null,
        created_at: p.p_at, updated_at: p.p_at });
    }
    return ok(legs);
  }
  if (url.includes('/teams')) return ok(team);
  if (url.includes('/runners')) return ok(runners);

  // Le faux serveur applique vraiment les PATCH, sinon il renverrait des
  // lignes perimees et l'app aurait raison de revenir en arriere.
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

const enPiste = () => page.locator('main .disp').first().textContent();
const badge = async () => (await page.locator('header .mono').last().textContent())?.trim();

await page.goto(`${BASE}#/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);

// --- 1. Identite du telephone ---
await page.getByRole('button', { name: 'Brunet' }).click();
await page.waitForTimeout(300);
const banner = await page.locator('main > div > div').first().textContent();
console.log('1. Bandeau perso     :', banner?.replace(/\s+/g, ' ').trim().slice(0, 60));

// --- 2. Compteur de boucles, y compris en tapant vite ---
const counter = page.locator('main .mono.text-2xl');
const plus = page.getByRole('button', { name: 'Ajouter une boucle' });
await plus.click();
await plus.click();
await plus.click();
await page.waitForTimeout(400);
console.log('2. Trois appuis « +1 »:', (await counter.textContent())?.trim(),
            (await counter.textContent())?.trim() === '3/3' ? '(compte juste)' : '*** APPUIS PERDUS ***');
await page.getByRole('button', { name: 'Retirer une boucle' }).click();
await page.waitForTimeout(300);
console.log('2. Apres un « -1 »   :', (await counter.textContent())?.trim());

// --- 3. Relais avec le reseau en echec ---
await page.getByRole('button', { name: 'Relais', exact: true }).click();
await page.waitForFunction(
  () => document.querySelector('main .disp')?.textContent?.includes('Brunet'),
  null, { timeout: 3000 });
console.log('3. En piste (optimiste):', await enPiste());
await page.waitForSelector('[role="alert"]', { timeout: 15000 });
console.log('3. Indicateur        :', await badge());

// --- 4. L onglet est tue puis rouvert, reseau toujours en echec ---
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const after = await enPiste();
console.log('4. Apres rechargement:', after, after === 'Brunet' ? '(relais conserve)' : '*** RELAIS PERDU ***');
await page.screenshot({ path: `${SHOTS}/7-apres-rechargement.png` });

// --- 5. Le reseau revient ---
rpcShouldFail = false;
const retry = page.getByRole('button', { name: 'Réessayer' });
if (await retry.count()) await retry.first().click();
await page.waitForFunction(
  () => !document.querySelector('[role="alert"]'), null, { timeout: 15000 });
await page.waitForTimeout(600);
console.log('5. Indicateur final  :', await badge());
console.log('5. Relais envoyes    :', relayedLegIds.size, relayedLegIds.size === 1 ? '(aucun doublon)' : '*** DOUBLON ***');
console.log('5. En piste final    :', await enPiste());

await browser.close();
