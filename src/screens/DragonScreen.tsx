import { useMemo } from 'react';
import { Dragon } from '../components/Dragon';
import { dragonStateOf, referenceKm, STAGES } from '../domain/dragon';
import { activeRunners, liveLegs, teamKm } from '../domain/schedule';
import { fmtKm } from '../lib/time';
import { openLegOf, type UseRace } from '../state/useRace';

interface Props {
  race: UseRace;
}

/**
 * Le dragon d'equipe. C'est une jauge de progression, et rien d'autre :
 * aucune donnee de course ne depend de cet ecran. Il est la parce qu'a
 * 4 h du matin, « encore 6 km avant qu'il ait des ailes » fait relever
 * quelqu'un, quand « 43 % » ne fait rien du tout.
 */
export function DragonScreen({ race }: Props) {
  const { team, runners, legs } = race.data!;

  const km = teamKm(legs, team.loopKm);
  const open = openLegOf(legs);
  const dragon = dragonStateOf(km, team.raceMinutes, team.refPaceSec, open !== null);

  const current = open ? runners.find((r) => r.id === open.runnerId) : undefined;
  // Le dragon prend la couleur de celui qui est en piste : on voit d'un
  // coup d'oeil qui le fait avancer en ce moment.
  const color = current?.color ?? activeRunners(runners)[0]?.color ?? '#F2A65A';

  const feeders = useMemo(() => {
    const done = liveLegs(legs);
    return activeRunners(runners)
      .map((r) => ({
        runner: r,
        km: done
          .filter((l) => l.runnerId === r.id)
          .reduce((a, l) => a + l.loops * team.loopKm, 0),
      }))
      .sort((a, b) => b.km - a.km);
  }, [legs, runners, team.loopKm]);

  const maxKm = Math.max(1, ...feeders.map((f) => f.km));
  const ref = referenceKm(team.raceMinutes, team.refPaceSec);

  return (
    <div className="px-4 pb-6 pt-3">
      <div className="card flex flex-col items-center">
        <Dragon stage={dragon.stage.index} color={color} awake={dragon.awake} size={224} />

        <div className="disp mt-1 text-[26px] font-semibold uppercase tracking-[0.1em]">
          {dragon.stage.name}
        </div>
        <div className="eyebrow mt-1">
          Stade {dragon.stage.index + 1} sur {STAGES.length}
        </div>
        <p className="mt-2.5 text-center text-[13px] leading-relaxed text-muted">
          {dragon.stage.flavour}
        </p>

        <div className="mt-3 w-full">
          <div className="h-1.5 overflow-hidden rounded-full bg-raised">
            <div
              className="h-1.5 rounded-full transition-[width] duration-700"
              style={{ width: `${dragon.stageProgress * 100}%`, background: color }}
            />
          </div>
          <div className="mt-1.5 flex items-baseline justify-between text-[11px] text-muted">
            <span className="mono">{fmtKm(km)} km</span>
            {dragon.next ? (
              <span>
                encore <span className="mono text-ink">{fmtKm(dragon.kmToNext ?? 0)} km</span> avant{' '}
                <span className="text-ink">{dragon.next.name}</span>
              </span>
            ) : (
              <span className="text-ink">Évolution maximale atteinte</span>
            )}
          </div>
        </div>

        <div className="mt-3 w-full rounded-xl border border-line bg-raised px-3 py-2.5 text-[11px] text-muted">
          {dragon.awake ? (
            <>
              <span className="text-ink">{current?.name ?? 'Quelqu’un'}</span> est en piste : le
              dragon court avec lui.
            </>
          ) : (
            'Personne sur le parcours — il somnole en attendant le prochain départ.'
          )}
        </div>
      </div>

      <section className="card mt-3">
        <div className="eyebrow">Qui le nourrit</div>
        <div className="mt-2">
          {feeders.map(({ runner, km: rk }) => (
            <div key={runner.id} className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0">
              <span
                className="h-3 w-3 flex-none rounded-full"
                style={{ background: runner.color }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{runner.name}</div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-raised">
                  <div
                    className="h-1 rounded-full"
                    style={{ width: `${(rk / maxKm) * 100}%`, background: runner.color }}
                  />
                </div>
              </div>
              <div className="mono flex-none text-sm">{fmtKm(rk)} km</div>
            </div>
          ))}
        </div>
      </section>

      <section className="card mt-3">
        <div className="eyebrow">Les sept stades</div>
        <ol className="mt-2">
          {STAGES.map((s) => {
            const reached = s.index <= dragon.stage.index;
            return (
              <li
                key={s.name}
                className={`flex items-center gap-3 border-b border-line py-2 last:border-b-0 ${
                  reached ? '' : 'opacity-40'
                }`}
              >
                <span className="mono w-4 flex-none text-[11px] text-muted">{s.index + 1}</span>
                <span className="flex-1 text-[13px]">{s.name}</span>
                <span className="mono flex-none text-[11px] text-muted">
                  {fmtKm(s.from * ref)} km
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-[11px] leading-relaxed text-dim">
          Les seuils sont calculés sur la durée de course et l’allure de référence de l’équipe :
          ils suivent vos réglages.
        </p>
      </section>
    </div>
  );
}
