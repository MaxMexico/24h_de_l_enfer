import { useMemo, useState } from 'react';
import { activeRunners, computeSchedule, computeTotals } from '../domain/schedule';
import type { Phase, Runner } from '../domain/types';
import { fmtClock, fmtKm, fmtPace, fmtShort } from '../lib/time';
import type { UseRace } from '../state/useRace';

interface Props {
  race: UseRace;
  now: number;
  offset: number;
  setOffset: (ms: number) => void;
  code: string;
  wakeLockOn: boolean;
  setWakeLockOn: (on: boolean) => void;
  wakeLockHeld: boolean;
  /** Ecart mesure avec l'horloge du serveur, en ms. */
  skew: number;
  meId: string | null;
  setMeId: (id: string) => void;
}

/** Palette : plus rapide et plus lisible qu'un selecteur de couleur natif. */
const PALETTE = [
  '#F2A65A', '#5BC0EB', '#E86A92', '#8FD694',
  '#C792EA', '#F4D35E', '#7FDBDA', '#E8825A',
];

export function EquipeScreen(props: Props) {
  const data = props.race.data!;
  const { now } = props;
  const { team, runners, legs } = data;
  const [tab, setTab] = useState<'bilan' | 'reglages'>('bilan');

  const schedule = useMemo(
    () => computeSchedule({ team, runners, legs, now }),
    [team, runners, legs, now],
  );
  const totals = useMemo(
    () => computeTotals(runners, legs, schedule, team.loopKm, team.refPaceSec),
    [runners, legs, schedule, team.loopKm, team.refPaceSec],
  );

  const maxKm = Math.max(1, ...totals.map((t) => t.projectedKm));

  return (
    <div className="px-4 pb-6 pt-3">
      <div className="mb-3 grid grid-cols-2 gap-2">
        {(['bilan', 'reglages'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-lg border px-3 py-2 text-xs uppercase tracking-[0.12em] ${
              tab === k ? 'border-ink text-ink' : 'border-line text-muted'
            }`}
          >
            {k === 'bilan' ? 'Bilan' : 'Réglages'}
          </button>
        ))}
      </div>

      {tab === 'bilan' ? (
        <div className="card">
          {totals.map((t) => {
            const runner = runners.find((r) => r.id === t.runnerId);
            if (!runner) return null;
            return (
              <div key={t.runnerId} className="flex items-start gap-3 border-b border-line py-3.5 last:border-b-0">
                <span
                  className="mt-1.5 h-3 w-3 flex-none rounded-full"
                  style={{ background: runner.color }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-base font-medium">{runner.name}</div>
                    <div className="mono text-[15px]">{fmtKm(t.km)} km</div>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-raised">
                    <div
                      className="h-1 rounded-full"
                      style={{ width: `${(t.km / maxKm) * 100}%`, background: runner.color }}
                    />
                  </div>
                  <div className="mt-1 text-[11px] text-muted">
                    {t.legs} relais · {fmtPace(t.paceSec)}/km · projection {t.projectedKm.toFixed(0)} km
                    {t.nextStartAt !== null && (
                      <>
                        {' · '}
                        <span className="mono">repart à {fmtClock(t.nextStartAt)}</span>
                        {t.nextStartAt > now && ` (dans ${fmtShort((t.nextStartAt - now) / 1000)})`}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Settings {...props} />
      )}
    </div>
  );
}

/* -------------------------------- reglages -------------------------------- */

function Settings({
  race, now, offset, setOffset, code,
  wakeLockOn, setWakeLockOn, wakeLockHeld, skew, meId, setMeId,
}: Props) {
  const data = race.data!;
  const { team, runners } = data;
  const roster = activeRunners(runners);
  const [draft, setDraft] = useState<Runner[]>(runners);
  const [dirty, setDirty] = useState(false);

  const move = (index: number, delta: number) => {
    const sorted = [...draft].sort((a, b) => a.position - b.position);
    const target = index + delta;
    if (target < 0 || target >= sorted.length) return;
    const a = sorted[index]!;
    const b = sorted[target]!;
    const swapped = sorted.map((r) => {
      if (r.id === a.id) return { ...r, position: b.position };
      if (r.id === b.id) return { ...r, position: a.position };
      return r;
    });
    setDraft(swapped);
    setDirty(true);
  };

  const patch = (id: string, over: Partial<Runner>) => {
    setDraft((prev) => prev.map((r) => (r.id === id ? { ...r, ...over } : r)));
    setDirty(true);
  };

  const sorted = [...draft].sort((a, b) => a.position - b.position);

  return (
    <div className="space-y-3">
      <section className="card">
        <div className="eyebrow">Coureurs et ordre de passage</div>
        <div className="mt-2">
          {sorted.map((r, i) => (
            <div key={r.id} className="flex items-center gap-2 border-b border-line py-2.5 last:border-b-0">
              <ColorSwatch
                value={r.color}
                name={r.name}
                onChange={(color) => patch(r.id, { color })}
              />
              <input
                type="text"
                value={r.name}
                aria-label={`Nom du coureur ${i + 1}`}
                onChange={(e) => patch(r.id, { name: e.target.value })}
                className="field flex-1"
              />
              <button type="button" aria-label={`Monter ${r.name}`} onClick={() => move(i, -1)}
                      disabled={i === 0}
                      className="h-9 w-9 flex-none rounded-lg border border-line bg-raised disabled:opacity-30">↑</button>
              <button type="button" aria-label={`Descendre ${r.name}`} onClick={() => move(i, 1)}
                      disabled={i === sorted.length - 1}
                      className="h-9 w-9 flex-none rounded-lg border border-line bg-raised disabled:opacity-30">↓</button>
              <button
                type="button"
                aria-label={r.active ? `Mettre ${r.name} en pause` : `Réintégrer ${r.name}`}
                onClick={() => patch(r.id, { active: !r.active })}
                className={`h-9 w-9 flex-none rounded-lg border text-xs ${
                  r.active ? 'border-line bg-raised' : 'border-[#E86A92]/50 text-[#E86A92]'
                }`}
              >
                {r.active ? '✓' : '·'}
              </button>
            </div>
          ))}
        </div>

        {dirty && (
          <button
            type="button"
            className="mt-3 w-full rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-bg"
            onClick={() => {
              race.saveRunners(draft);
              setDirty(false);
            }}
          >
            Enregistrer la rotation
          </button>
        )}
        {roster.length === 0 && (
          <p className="mt-2 text-[11px] text-[#E86A92]">
            Aucun coureur actif : la rotation ne peut pas être calculée.
          </p>
        )}
      </section>

      <AddRunnerForm race={race} used={draft.map((r) => r.color)} />

      <IdentitySettings runners={roster} meId={meId} setMeId={setMeId} />

      <RaceSettings race={race} />

      <details className="card">
        <summary className="eyebrow cursor-pointer list-none">
          Avancé · phases de la rotation
        </summary>
        <PhaseSettings race={race} phases={team.phases} />
      </details>

      <section className="card">
        <div className="eyebrow">Mode test</div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-dim">
          Le départ réel est le {new Date(team.raceStart).toLocaleString('fr-FR', {
            weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
          })}. Décale l’horloge pour répéter le fonctionnement avant le jour J.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button type="button" className="chip" onClick={() => setOffset(team.raceStart - Date.now() + 60000)}>
            Aller au départ
          </button>
          <button type="button" className="chip" onClick={() => setOffset(offset + 5 * 60000)}>+5 min</button>
          <button type="button" className="chip" onClick={() => setOffset(offset + 30 * 60000)}>+30 min</button>
          <button type="button" className="chip" onClick={() => setOffset(offset + 3600000)}>+1 h</button>
          <button type="button" className="chip" onClick={() => setOffset(0)}>Heure réelle</button>
        </div>
        {offset !== 0 && (
          <p className="mt-2 text-[11px] text-[#F2A65A]">
            Horloge décalée de {fmtShort(Math.abs(offset) / 1000)} — les relais enregistrés
            utilisent cette heure. Il est {fmtClock(now)}.
          </p>
        )}
      </section>

      <section className="card">
        <div className="eyebrow">Session</div>
        <dl className="mt-2 space-y-1.5 text-[12px]">
          <Row k="Équipe" v={team.name} />
          <Row k="Code d’accès" v={code} mono />
          <Row k="Boucle" v={`${team.loopKm} km`} mono />
          <Row k="Temps réel" v={race.live ? 'connecté' : 'reconnexion…'} />
          <Row
            k="Écart d’horloge"
            v={Math.abs(skew) < 1000 ? 'aligné' : `${skew > 0 ? '+' : ''}${(skew / 1000).toFixed(1)} s`}
            mono
          />
        </dl>

        <label className="mt-3 flex items-center gap-3 rounded-xl border border-line bg-raised px-3 py-3">
          <input
            type="checkbox"
            checked={wakeLockOn}
            onChange={(e) => setWakeLockOn(e.target.checked)}
            className="h-5 w-5 flex-none accent-[#5BC0EB]"
          />
          <span className="min-w-0 flex-1 text-[13px]">
            Garder l’écran allumé
            <span className="mt-0.5 block text-[11px] text-muted">
              À activer sur le téléphone posé en zone relais. Ailleurs, c’est de
              la batterie en moins.
              {wakeLockOn && !wakeLockHeld && ' Refusé par ce navigateur.'}
            </span>
          </span>
        </label>
        <button type="button" className="ghost mt-3" onClick={race.refresh}>
          Recharger depuis le serveur
        </button>
      </section>
    </div>
  );
}

/** Pastille de couleur : huit choix, un seul appui, pas de pipette. */
function ColorSwatch({
  value,
  name,
  onChange,
}: {
  value: string;
  name: string;
  onChange: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative flex-none">
      <button
        type="button"
        aria-label={`Couleur de ${name}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="h-9 w-9 rounded-lg border border-line"
        style={{ background: value }}
      />
      {open && (
        <div className="absolute left-0 top-11 z-10 grid grid-cols-4 gap-1.5 rounded-xl border border-line bg-surface p-2 shadow-xl">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Choisir ${c}`}
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
              className={`h-8 w-8 rounded-lg border ${c === value ? 'border-ink' : 'border-line'}`}
              style={{ background: c }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Un cinquieme larron peut se greffer : l'ajout n'est plus du code mort. */
function AddRunnerForm({ race, used }: { race: UseRace; used: string[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const free = PALETTE.find((c) => !used.includes(c)) ?? PALETTE[0]!;
  const [color, setColor] = useState(free);

  if (!open) {
    return (
      <button type="button" className="ghost" onClick={() => setOpen(true)}>
        Ajouter un coureur
      </button>
    );
  }

  return (
    <form
      className="card space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const clean = name.trim();
        if (!clean) return;
        race.addRunner({ name: clean, color });
        setName('');
        setOpen(false);
      }}
    >
      <div className="eyebrow">Nouveau coureur</div>
      <div className="flex items-center gap-2">
        <ColorSwatch value={color} name="le nouveau coureur" onChange={setColor} />
        <input
          className="field flex-1"
          aria-label="Nom du nouveau coureur"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Prénom"
          autoFocus
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="ghost" onClick={() => setOpen(false)}>
          Annuler
        </button>
        <button
          type="submit"
          disabled={name.trim() === ''}
          className="rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-bg disabled:bg-raised disabled:text-dim"
        >
          Ajouter
        </button>
      </div>
    </form>
  );
}

/** Qui tient ce telephone — sert au compte a rebours personnel. */
function IdentitySettings({
  runners,
  meId,
  setMeId,
}: {
  runners: Runner[];
  meId: string | null;
  setMeId: (id: string) => void;
}) {
  return (
    <section className="card">
      <div className="eyebrow">Ce téléphone</div>
      <p className="mt-1 text-[11px] text-muted">
        Affiche « tu repars dans… » en haut de l’écran Course.
      </p>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        {runners.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setMeId(r.id)}
            aria-pressed={meId === r.id}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${
              meId === r.id ? 'border-ink' : 'border-line bg-raised'
            }`}
          >
            <span
              className="h-3 w-3 flex-none rounded-full"
              style={{ background: r.color }}
              aria-hidden
            />
            {r.name}
          </button>
        ))}
      </div>
    </section>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className={mono ? 'mono' : ''}>{v}</dd>
    </div>
  );
}

function RaceSettings({ race }: { race: UseRace }) {
  const team = race.data!.team;
  const [start, setStart] = useState(() => toLocalInput(team.raceStart));
  const [loopKm, setLoopKm] = useState(String(team.loopKm));
  const [pace, setPace] = useState(String(Math.round(team.refPaceSec / 60)) + ':' +
    String(team.refPaceSec % 60).padStart(2, '0'));

  const paceSec = parsePace(pace);
  const startMs = new Date(start).getTime();
  const km = Number(loopKm.replace(',', '.'));
  const valid = Number.isFinite(startMs) && km > 0 && paceSec !== null;

  return (
    <section className="card">
      <div className="eyebrow">Course</div>
      <div className="mt-2 space-y-3">
        <div>
          <label className="stat-k block" htmlFor="set-start">Heure de départ</label>
          <input id="set-start" type="datetime-local" className="field mt-1"
                 value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="stat-k block" htmlFor="set-loop">Boucle (km)</label>
            <input id="set-loop" type="text" inputMode="decimal" className="field mt-1"
                   value={loopKm} onChange={(e) => setLoopKm(e.target.value)} />
          </div>
          <div>
            <label className="stat-k block" htmlFor="set-pace">Allure réf. (min/km)</label>
            <input id="set-pace" type="text" inputMode="numeric" className="field mt-1"
                   value={pace} onChange={(e) => setPace(e.target.value)} />
          </div>
        </div>
        <button
          type="button"
          disabled={!valid}
          onClick={() => race.saveTeam({ raceStart: startMs, loopKm: km, refPaceSec: paceSec! })}
          className="w-full rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-bg disabled:bg-raised disabled:text-dim"
        >
          Enregistrer
        </button>
        {!valid && <p className="text-[11px] text-[#E86A92]">Allure attendue au format 6:00.</p>}
      </div>
    </section>
  );
}

function PhaseSettings({ race, phases }: { race: UseRace; phases: Phase[] }) {
  const [draft, setDraft] = useState<Phase[]>(phases);
  const [dirty, setDirty] = useState(false);

  const patch = (id: string, over: Partial<Phase>) => {
    setDraft((prev) => prev.map((p) => (p.id === id ? { ...p, ...over } : p)));
    setDirty(true);
  };

  return (
    <div className="mt-3 space-y-3">
        {draft.map((p) => (
          <div key={p.id} className="border-b border-line pb-3 last:border-b-0 last:pb-0">
            <div className="flex items-baseline justify-between">
              <div className="text-sm font-medium">{p.label}</div>
              <div className="mono text-[11px] text-muted">
                {fmtOffset(p.from)} → {fmtOffset(p.to)}
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <select
                className="field flex-1"
                aria-label={`Format de la phase ${p.label}`}
                value={p.mode}
                onChange={(e) => patch(p.id, { mode: e.target.value as Phase['mode'] })}
              >
                <option value="loops">Nombre de boucles</option>
                <option value="time">Durée fixe</option>
              </select>
              {p.mode === 'loops' ? (
                <input
                  type="number" min={1} max={20} className="field w-20"
                  aria-label={`Boucles par relais, phase ${p.label}`}
                  value={p.loops ?? 3}
                  onChange={(e) => patch(p.id, { loops: Math.max(1, Number(e.target.value)) })}
                />
              ) : (
                <input
                  type="number" min={5} max={240} step={5} className="field w-20"
                  aria-label={`Minutes par bloc, phase ${p.label}`}
                  value={p.minutes ?? 60}
                  onChange={(e) => patch(p.id, { minutes: Math.max(5, Number(e.target.value)) })}
                />
              )}
            </div>
          </div>
        ))}
      {dirty && (
        <button
          type="button"
          className="w-full rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-bg"
          onClick={() => {
            race.saveTeam({ phases: draft });
            setDirty(false);
          }}
        >
          Enregistrer les phases
        </button>
      )}
    </div>
  );
}

const fmtOffset = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
};

const parsePace = (raw: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const sec = Number(m[1]) * 60 + Number(m[2]);
  return sec >= 120 && sec <= 1800 ? sec : null;
};

const toLocalInput = (ms: number): string => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
