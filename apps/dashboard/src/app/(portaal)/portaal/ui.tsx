/**
 * De handvol bouwstenen waar het portaal uit bestaat. Bewust klein gehouden en
 * los van de EVA-componenten: die trekken rechten, dialogen en toasts mee, en
 * hoe minder het portaal met EVA deelt, hoe kleiner de kans dat er ooit iets
 * doorheen lekt wat een klant niet hoort te zien.
 */

/**
 * De breedte van het portaal, op één plek.
 *
 * Tot ~1024px blijft het één leeskolom van 768px — de prettige breedte voor een
 * telefoon en een smal venster. Daarboven mag het portaal de ruimte pakken die
 * er is; op een breed scherm bleef anders ruim de helft leeg.
 *
 * Kop, inhoud en voettekst gebruiken allemaal dit, anders lopen ze uit elkaar
 * zodra iemand er één aanpast.
 */
export const CONTAINER = 'mx-auto w-full max-w-3xl px-5 lg:max-w-6xl lg:px-8'

export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={`${CONTAINER}${className ? ` ${className}` : ''}`}>{children}</div>
}

/**
 * De twee-koloms indeling van een project op breed scherm: het projectverloop
 * links, een meelopende kolom rechts met de contactpersonen en het gesprek.
 *
 * `items-start` is niet optioneel — zonder dat rekken de kolommen elkaar op tot
 * de hoogte van de langste, en dan zweeft de zijkolom halverwege in het niets.
 * Onder `lg` stapelt alles gewoon en komt de zijkolom onderaan: op een telefoon
 * wil je eerst zien wat er met je project gebeurt.
 */
export function Kolommen({ hoofd, zij }: { hoofd: React.ReactNode; zij: React.ReactNode }) {
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_368px] lg:items-start lg:gap-6">
      <div className="space-y-5">{hoofd}</div>
      <div className="mt-5 space-y-5 lg:sticky lg:top-6 lg:mt-0">{zij}</div>
    </div>
  )
}

export function Kaart({
  titel,
  subtitel,
  actie,
  children,
}: {
  titel?: string
  subtitel?: string
  actie?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white px-4 py-4 sm:px-5">
      {(titel || actie) && (
        <header className="mb-3 flex items-baseline justify-between gap-3">
          <div>
            {titel && <h2 className="text-sm font-bold">{titel}</h2>}
            {subtitel && <p className="mt-0.5 text-xs text-neutral-500">{subtitel}</p>}
          </div>
          {actie}
        </header>
      )}
      {children}
    </section>
  )
}

export function Leeg({ children }: { children: React.ReactNode }) {
  return <p className="py-1 text-[13px] text-neutral-500">{children}</p>
}
