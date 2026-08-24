/** Bandeau de relance : l'envoi a echoue trois fois, l'utilisateur decide. */
export function RetryBanner({ count, onRetry }: { count: number; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="sticky top-0 z-20 flex items-center gap-3 border-b border-[#E86A92]/40 bg-[#E86A92]/15 px-4 py-3"
    >
      <div className="flex-1 text-[13px] leading-snug">
        <div className="font-medium text-ink">
          {count > 1 ? `${count} enregistrements non envoyés` : 'Enregistrement non envoyé'}
        </div>
        <div className="text-[11px] text-muted">
          Rien n’est perdu : l’identifiant est déjà généré, la relance ne crée pas de doublon.
        </div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="flex-none rounded-lg border border-[#E86A92]/60 px-3 py-2 text-[13px] font-medium text-ink active:bg-[#E86A92]/25"
      >
        Réessayer
      </button>
    </div>
  );
}
