'use client'

/**
 * "Openstaand extern": alles wat over alle dossiers heen bij onderaannemers en leveranciers ligt,
 * gegroepeerd per partij, met de mogelijkheid om ze in één keer te herinneren.
 *
 * Eén rappelmail per partij, niet per regel: een onderaannemer met vijf openstaande uitvragen krijgt
 * één mail met vijf regels, niet vijf losse mails.
 *
 * De data wordt pas geladen bij het openen van het venster. De aanvragenpagina doet al vier
 * parallelle queries; een vijfde voor iedereen die de knop niet aanklikt is verspild werk.
 */

import { useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  Button, Badge, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter, Spinner,
} from '@/components/ui'
import {
  getOpenstaandeUitvragen, getRappelTekst,
  type PartijGroep, type OpenstaandOverzicht,
} from '@/lib/dossiers/uitvragen-overzicht'
import { verstuurRappels, type RappelUitkomst } from '@/lib/dossiers/uitvraag-mail-acties'
import { SECTIE_ROUTE } from './open-dossier'

/** Gelijk aan de servergrens in `verstuurRappels`; hier alleen om de knop tijdig te blokkeren. */
const MAX_PARTIJEN = 20

type Stap = 'selectie' | 'bericht' | 'verslag'

const inputCls =
  'w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-[13px] text-neutral-800 outline-none focus:border-brand-500'

export default function OpenstaandeUitvragenKnop() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<OpenstaandOverzicht | null>(null)
  const [laden, setLaden] = useState(false)
  const [stap, setStap] = useState<Stap>('selectie')
  const [gekozen, setGekozen] = useState<Set<string>>(new Set())
  const [ingeklapt, setIngeklapt] = useState<Set<string>>(new Set())
  const [alleenTeLaat, setAlleenTeLaat] = useState(false)
  const [adressen, setAdressen] = useState<Record<string, string>>({})
  const [tekst, setTekst] = useState({ onderwerp: '', bericht: '' })
  const [bezig, setBezig] = useState(false)
  const [verslag, setVerslag] = useState<RappelUitkomst[]>([])

  async function openen() {
    setOpen(true)
    setStap('selectie')
    setGekozen(new Set())
    setVerslag([])
    setLaden(true)
    try {
      const [overzicht, standaard] = await Promise.all([getOpenstaandeUitvragen(), getRappelTekst()])
      setData(overzicht)
      setTekst(standaard)
      // Adressen die de server voorstelt als startpunt; per partij nog aan te passen.
      setAdressen(Object.fromEntries(overzicht.partijen.map(p => [p.sleutel, p.email])))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kon het overzicht niet laden.')
      setOpen(false)
    } finally {
      setLaden(false)
    }
  }

  const partijen = (data?.partijen ?? []).filter(p => !alleenTeLaat || p.teLaat > 0)
  const geselecteerd = (data?.partijen ?? []).filter(p => gekozen.has(p.sleutel))
  const regelsGekozen = geselecteerd.reduce((n, p) => n + p.rijen.length, 0)

  function wissel(sleutel: string) {
    setGekozen(s => {
      const n = new Set(s)
      if (n.has(sleutel)) n.delete(sleutel); else n.add(sleutel)
      return n
    })
  }

  function klap(sleutel: string) {
    setIngeklapt(s => {
      const n = new Set(s)
      if (n.has(sleutel)) n.delete(sleutel); else n.add(sleutel)
      return n
    })
  }

  async function verstuur() {
    setBezig(true)
    try {
      const r = await verstuurRappels(
        geselecteerd.map(p => ({
          relatieId: p.relatieId,
          partijNaam: p.naam,
          uitvraagIds: p.rijen.map(x => x.id),
          to: adressen[p.sleutel] ?? '',
        })),
        tekst,
      )
      if (!r.ok) { toast.error(r.error); return }
      setVerslag(r.uitkomsten)
      setStap('verslag')
      const gelukt = r.uitkomsten.filter(u => u.ok).length
      const mislukt = r.uitkomsten.length - gelukt
      if (mislukt === 0) toast.success(`${gelukt} herinnering(en) verstuurd`)
      else toast.error(`${gelukt} verstuurd · ${mislukt} mislukt`)
      // Verstuurde regels tellen niet meer als "nooit gerappelleerd"; verse stand ophalen.
      getOpenstaandeUitvragen().then(setData).catch(() => {})
    } finally {
      setBezig(false)
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={openen} title="Alles wat extern openstaat">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" />
        </svg>
        Openstaand extern
      </Button>

      <Dialog open={open} onOpenChange={o => { if (!o && !bezig) setOpen(false) }}>
        {/* xl is 920px; met dossiernaam + datums naast elkaar is dat krap, dus iets breder. */}
        <DialogContent size="xl" style={{ maxWidth: 'min(1100px, 94vw)', width: '94vw' }}>
          <DialogHeader>
            <DialogTitle>
              {stap === 'selectie' && 'Openstaand bij onderaannemers en leveranciers'}
              {stap === 'bericht'  && `Herinnering aan ${geselecteerd.length} partij(en)`}
              {stap === 'verslag'  && 'Verstuurd'}
            </DialogTitle>
            <DialogDescription>
              {stap === 'selectie' && 'Kies de partijen die je aan hun prijsopgave wilt herinneren.'}
              {stap === 'bericht'  && 'Controleer de tekst en de adressen voordat je verstuurt.'}
              {stap === 'verslag'  && 'Wat er is verstuurd en wat niet.'}
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            {laden && (
              <div className="flex items-center gap-2 py-8 text-[13px] text-neutral-500">
                <Spinner size="sm" /> Overzicht laden…
              </div>
            )}

            {!laden && stap === 'selectie' && data && (
              data.totaalRijen === 0 ? (
                <p className="py-8 text-center text-[13px] text-neutral-500">
                  Er staat op dit moment niets extern open.
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[12.5px] text-neutral-600">
                      {data.totaalRijen} uitvragen bij {data.partijen.length} partijen
                      {data.partijenZonderAdres > 0 && (
                        <span className="text-warning-700"> · {data.partijenZonderAdres} zonder e-mailadres</span>
                      )}
                    </p>
                    <label className="flex items-center gap-1.5 text-[12.5px] text-neutral-600">
                      <input type="checkbox" checked={alleenTeLaat} onChange={e => setAlleenTeLaat(e.target.checked)} />
                      Alleen te laat
                    </label>
                  </div>

                  <div className="max-h-[56vh] space-y-2 overflow-y-auto pr-1">
                    {partijen.map(p => (
                      <PartijBlok
                        key={p.sleutel}
                        partij={p}
                        gekozen={gekozen.has(p.sleutel)}
                        open={!ingeklapt.has(p.sleutel)}
                        onWissel={() => wissel(p.sleutel)}
                        onKlap={() => klap(p.sleutel)}
                      />
                    ))}
                  </div>
                </div>
              )
            )}

            {!laden && stap === 'bericht' && (
              <div className="space-y-3">
                <p className="text-[12.5px] text-neutral-600">
                  Elke partij krijgt één mail met al hun openstaande uitvragen als tabel eronder.
                  Gebruik <code className="rounded bg-neutral-100 px-1">{'{partij.naam}'}</code> voor de naam.
                </p>

                <label className="block">
                  <span className="block text-[11.5px] font-semibold uppercase tracking-wide text-neutral-500">Onderwerp</span>
                  <input className={`${inputCls} mt-1`} value={tekst.onderwerp}
                    onChange={e => setTekst(t => ({ ...t, onderwerp: e.target.value }))} disabled={bezig} />
                </label>

                <label className="block">
                  <span className="block text-[11.5px] font-semibold uppercase tracking-wide text-neutral-500">Bericht</span>
                  <textarea className={`${inputCls} mt-1 min-h-[150px] leading-relaxed`} value={tekst.bericht}
                    onChange={e => setTekst(t => ({ ...t, bericht: e.target.value }))} disabled={bezig} />
                </label>

                <div>
                  <span className="block text-[11.5px] font-semibold uppercase tracking-wide text-neutral-500">Ontvangers</span>
                  <div className="mt-1 space-y-1.5">
                    {geselecteerd.map(p => (
                      <div key={p.sleutel} className="flex items-center gap-2">
                        <span className="w-56 shrink-0 truncate text-[12.5px] text-neutral-700" title={p.naam}>
                          {p.naam}
                          <span className="text-neutral-400"> ({p.rijen.length})</span>
                        </span>
                        <input
                          className={`${inputCls} py-1.5 ${!(adressen[p.sleutel] ?? '').trim() ? 'border-warning-300 bg-warning-50' : ''}`}
                          value={adressen[p.sleutel] ?? ''}
                          disabled={bezig}
                          placeholder="Geen e-mailadres bekend — vul in"
                          onChange={e => setAdressen(a => ({ ...a, [p.sleutel]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {!laden && stap === 'verslag' && (
              <div className="space-y-1.5">
                {verslag.map((u, i) => (
                  <div key={`${u.partijNaam}-${i}`}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-[12.5px] ${
                      u.ok ? 'border-success-300 bg-success-50 text-success-700'
                           : 'border-error-300 bg-error-50 text-error-700'}`}>
                    <span className="font-medium">{u.partijNaam}</span>
                    <span className="text-neutral-500">·</span>
                    <span>
                      {u.ok ? `${u.aantal} uitvraag(en) herinnerd` : (u.error ?? 'mislukt')}
                      {u.waarschuwing && ` — ${u.waarschuwing}`}
                    </span>
                  </div>
                ))}
                {verslag.some(u => !u.ok) && (
                  <p className="pt-1 text-[12px] text-neutral-500">
                    De mislukte partijen zijn niet bijgewerkt; je kunt ze opnieuw selecteren en het nog eens proberen.
                  </p>
                )}
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            {stap === 'selectie' && (
              <>
                <span className="mr-auto text-[12.5px] text-neutral-500">
                  {gekozen.size > 0 ? `${gekozen.size} partij(en) · ${regelsGekozen} uitvragen` : 'Selecteer partijen'}
                </span>
                <Button variant="ghost" onClick={() => setOpen(false)}>Sluiten</Button>
                <Button
                  variant="primary"
                  disabled={gekozen.size === 0 || gekozen.size > MAX_PARTIJEN}
                  onClick={() => setStap('bericht')}
                  title={gekozen.size > MAX_PARTIJEN ? `Maximaal ${MAX_PARTIJEN} partijen per keer` : undefined}
                >
                  {gekozen.size > MAX_PARTIJEN ? `Maximaal ${MAX_PARTIJEN} partijen` : 'Herinnering opstellen'}
                </Button>
              </>
            )}

            {stap === 'bericht' && (
              <>
                <Button variant="ghost" onClick={() => setStap('selectie')} disabled={bezig}>Terug</Button>
                <Button variant="primary" onClick={verstuur} disabled={bezig}>
                  {bezig ? 'Versturen…' : `Verstuur ${geselecteerd.length} herinnering(en)`}
                </Button>
              </>
            )}

            {stap === 'verslag' && (
              <>
                <Button variant="ghost" onClick={() => setStap('selectie')}>Terug naar overzicht</Button>
                <Button variant="primary" onClick={() => setOpen(false)}>Sluiten</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Eén partij met zijn openstaande uitvragen; in te klappen omdat een partij er veel kan hebben. */
function PartijBlok({ partij, gekozen, open, onWissel, onKlap }: {
  partij: PartijGroep; gekozen: boolean; open: boolean; onWissel: () => void; onKlap: () => void
}) {
  return (
    <div className={`rounded-lg border ${gekozen ? 'border-brand-300 bg-brand-50/40' : 'border-neutral-200'}`}>
      <div className="flex items-center gap-2 px-3 py-2">
        <input type="checkbox" checked={gekozen} onChange={onWissel} className="shrink-0" />
        <button type="button" onClick={onKlap} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="truncate text-[13px] font-medium text-neutral-800">{partij.naam}</span>
          <Badge tone="neutral" size="sm">{partij.rijen.length}</Badge>
          {partij.teLaat > 0 && <Badge tone="error" size="sm">{partij.teLaat} te laat</Badge>}
          {!partij.heeftAdres && <Badge tone="warning" size="sm">geen e-mailadres</Badge>}
          {partij.relatieId && !partij.actief && <Badge tone="warning" size="sm">inactief</Badge>}
          <span className="ml-auto shrink-0 text-[11.5px] text-neutral-500">
            langst open: {partij.langstOpen} d
          </span>
        </button>
      </div>

      {open && (
        <div className="border-t border-neutral-100 px-3 py-1.5">
          <table className="w-full text-[12px]">
            <tbody>
              {partij.rijen.map(r => (
                <tr key={r.id} className="border-b border-neutral-50 last:border-0">
                  <td className="py-1 pr-2">
                    <Link
                      href={`/${SECTIE_ROUTE[r.sectie]}/${r.dossierId}/uitvraag`}
                      target="_blank"
                      className="text-neutral-700 hover:underline"
                    >
                      <span className="tabular-nums text-neutral-500">{r.dossiernummer}</span>{' '}
                      {r.dossierTitel}
                    </Link>
                  </td>
                  <td className="py-1 pr-2 w-32 text-neutral-600">{r.discipline}</td>
                  <td className="py-1 pr-2 w-24 whitespace-nowrap tabular-nums">
                    <span className={r.teLaat ? 'font-semibold text-error-600' : 'text-neutral-500'}>
                      {r.dagenOpen} d open
                    </span>
                  </td>
                  <td className="py-1 w-20 whitespace-nowrap text-right text-neutral-400">
                    {r.rappels > 0 ? `${r.rappels}× herinnerd` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
