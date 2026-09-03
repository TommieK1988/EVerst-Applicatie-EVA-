'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { PortaalMeerwerkRegel } from '@/lib/portaal/meerwerk'
import { datumTijd, euro } from '@/lib/portaal/format'
import { portaalBeoordeelMeerwerk } from '../../actions'

/**
 * Meerwerk zoals de klant het beoordeelt.
 *
 * Een akkoord hier is bindend: de post gaat meteen mee in het projecttotaal en
 * wordt uitgevoerd. Daarom geen kale knop maar een bevestigingsstap waarin het
 * bedrag nog een keer staat — dit is het moment waarop iemand geld uitgeeft, en
 * dat hoort even te wringen.
 *
 * Afwijzen vraagt om een toelichting. Niet omdat het moet, maar omdat "waarom
 * niet?" anders de eerste vraag is die het projectteam moet stellen.
 */
export function MeerwerkLijst({
  dossierId,
  regels,
}: {
  dossierId: string
  regels: PortaalMeerwerkRegel[]
}) {
  const router = useRouter()
  const [bezig, start] = useTransition()
  const [fout, setFout] = useState<string | null>(null)
  /** Welke regel staat open ter bevestiging, en met welk besluit. */
  const [vraag, setVraag] = useState<{ regel: PortaalMeerwerkRegel; besluit: 'akkoord' | 'afgewezen' } | null>(null)
  const [toelichting, setToelichting] = useState('')

  function bevestig() {
    if (!vraag) return
    setFout(null)
    start(async () => {
      const r = await portaalBeoordeelMeerwerk(dossierId, vraag.regel.id, vraag.besluit, toelichting)
      if (!r.ok) { setFout(r.error); return }
      setVraag(null)
      setToelichting('')
      router.refresh()
    })
  }

  return (
    <>
      {fout && <p className="mb-2 text-[13px] text-error-600">{fout}</p>}

      <ul className="divide-y divide-neutral-100">
        {regels.map(r => (
          <li key={r.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="mr-1.5 font-bold text-neutral-400">{r.nummer}</span>
                  {r.omschrijving}
                </p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {euro(r.bedragExcl)} excl. btw
                  {r.btwPct > 0 && ` · ${euro(r.bedragIncl)} incl. ${r.btwPct}% btw`}
                  {/* Bij regie is het bedrag een richtbedrag: er wordt afgerekend
                      op wat er werkelijk aan uren en materiaal in gaat. Dat hoort
                      erbij te staan, anders leest het als een vaste prijs. */}
                  {r.opNacalculatie && (
                    <span className="block text-neutral-400">Richtbedrag — wordt op nacalculatie afgerekend</span>
                  )}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                  r.teBeoordelen
                    ? 'bg-warning-50 text-warning-700'
                    : r.besluit && r.status === 'Afgewezen'
                    ? 'bg-neutral-100 text-neutral-600'
                    : r.status === 'Akkoord' || r.status === 'Uitgevoerd'
                    ? 'bg-success-50 text-success-700'
                    : 'bg-neutral-100 text-neutral-600'
                }`}
              >
                {r.status}
              </span>
            </div>

            {/* Wie besliste, en wanneer. Staat er altijd bij zodra er een besluit
                is — ook als het door ons is genomen. */}
            {r.besluit && (
              <p className="mt-1 text-[11px] text-neutral-400">
                {r.status} door {r.besluit.door} op {datumTijd(r.besluit.op)}
                {r.besluit.opmerking && <span className="block italic">“{r.besluit.opmerking}”</span>}
              </p>
            )}

            {r.teBeoordelen && vraag?.regel.id !== r.id && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={bezig}
                  onClick={() => { setVraag({ regel: r, besluit: 'akkoord' }); setToelichting(''); setFout(null) }}
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  Akkoord
                </button>
                <button
                  type="button"
                  disabled={bezig}
                  onClick={() => { setVraag({ regel: r, besluit: 'afgewezen' }); setToelichting(''); setFout(null) }}
                  className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                >
                  Afwijzen
                </button>
              </div>
            )}

            {vraag?.regel.id === r.id && (
              <div className="mt-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                <p className="text-[13px] font-semibold">
                  {vraag.besluit === 'akkoord'
                    ? `Akkoord op ${euro(r.bedragIncl)} incl. btw?`
                    : 'Deze post afwijzen?'}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-neutral-600">
                  {vraag.besluit === 'akkoord'
                    ? 'Dit werk wordt dan uitgevoerd en komt bij de opdrachtsom. Uw akkoord wordt met naam en tijdstip vastgelegd.'
                    : 'Wij voeren dit werk dan niet uit. Uw besluit wordt met naam en tijdstip vastgelegd.'}
                </p>
                <textarea
                  value={toelichting}
                  onChange={e => setToelichting(e.target.value)}
                  rows={2}
                  placeholder={vraag.besluit === 'akkoord' ? 'Eventuele opmerking (optioneel)' : 'Waarom wijst u dit af?'}
                  className="mt-2 w-full resize-y rounded border border-neutral-300 px-2 py-1.5 text-[13px] outline-none focus:border-brand-500"
                />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={bezig}
                    onClick={bevestig}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50 ${
                      vraag.besluit === 'akkoord' ? 'bg-brand-600 hover:bg-brand-700' : 'bg-neutral-700 hover:bg-neutral-800'
                    }`}
                  >
                    {bezig ? 'Bezig…' : vraag.besluit === 'akkoord' ? 'Ja, ik ga akkoord' : 'Ja, afwijzen'}
                  </button>
                  <button
                    type="button"
                    disabled={bezig}
                    onClick={() => { setVraag(null); setToelichting('') }}
                    className="text-xs font-semibold text-neutral-500 hover:text-neutral-800"
                  >
                    Annuleren
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
