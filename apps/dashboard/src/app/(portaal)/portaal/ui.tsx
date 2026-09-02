/**
 * De handvol bouwstenen waar het portaal uit bestaat. Bewust klein gehouden en
 * los van de EVA-componenten: die trekken rechten, dialogen en toasts mee, en
 * hoe minder het portaal met EVA deelt, hoe kleiner de kans dat er ooit iets
 * doorheen lekt wat een klant niet hoort te zien.
 */

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
