'use client'

/**
 * Offertes → Opschonen: de oude open offertes in twee bakken, aanvinken en in één keer laten
 * vervallen (ook in Bouw7). Indeling en standaardvinkjes: zie opschonen.ts.
 *
 * Bewust een bevestigingsstap vóór het afsluiten: dit raakt tientallen offertes én Bouw7, en
 * terugdraaien kan alleen per offerte.
 */

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { cn } from '@everts/ui'
import { Button } from '@/components/ui/button'
import type { DossierRij } from '@/components/dossiers/types'
import { vandaagNL } from '@/lib/wagenpark/periode'
import { getMedewerkers } from '@/lib/dossiers/actions'
import { getLaatsteContacten } from '@/lib/commercie/paneel'
import { getBedragklassegrenzen } from '@/lib/commercie/bedragklassen-actions'
import { STANDAARD_GRENZEN, type Bedragklassegrenzen } from '@/lib/commercie/bedragklassen'
import { VERVAL_REDENEN } from '@/lib/commercie/types'
import { sluitOffertesAf } from '@/lib/commercie/opschonen-actions'
import { eur, eurKort, kortDatum, maakTeDoenRij, type LaatsteContact, type TeDoenRij } from './te-doen'
import { BAK_A_BEKIJKEN_VANAF, deelInBakken, standaardSelectie } from './opschonen'
import { OfferteZijpaneel } from './OfferteZijpaneel'

const PORTIE = 10

type Props = { dossiers: DossierRij[]; mijnMedewerkerId: string | null }

export function OpschoonLijst(props: Props) {
  const router = useRouter()
  const vandaag = React.useMemo(() => vandaagNL(), [])
  const [grenzen, setGrenzen] = React.useState<Bedragklassegrenzen>(STANDAARD_GRENZEN)
  React.useEffect(() => { getBedragklassegrenzen().then(setGrenzen).catch(() => {}) }, [])

  const alle = React.useMemo(
    () => props.dossiers.map(d => maakTeDoenRij(d, vandaag, grenzen)).filter(r => r._status !== 'afgerond'),
    [props.dossiers, vandaag, grenzen],
  )

  // Zonder de contacten weten we niet wat in bak A hoort; tot dan niets tonen.
  const [contacten, setContacten] = React.useState<Map<string, LaatsteContact> | null>(null)
  React.useEffect(() => {
    const ids = alle.map(r => r.id)
    if (ids.length === 0) { setContacten(new Map()); return }
    getLaatsteContacten(ids)
      .then(regels => setContacten(new Map(regels.map(r => [r.dossierId, r]))))
      .catch(() => setContacten(new Map()))
  }, [alle])

  const bakken = React.useMemo(
    () => (contacten ? deelInBakken(alle, id => contacten.has(id)) : null),
    [alle, contacten],
  )

  const [gekozen, setGekozen] = React.useState<Set<string>>(new Set())
  const voorgevuld = React.useRef(false)
  React.useEffect(() => {
    if (!bakken || voorgevuld.current) return
    voorgevuld.current = true
    setGekozen(standaardSelectie(bakken.a))
  }, [bakken])

  const zet = (ids: string[], aan: boolean) => setGekozen(s => {
    const n = new Set(s)
    for (const id of ids) { if (aan) n.add(id); else n.delete(id) }
    return n
  })

  const [reden, setReden] = React.useState<string>('Geen reactie meer van klant')
  const [bevestigen, setBevestigen] = React.useState(false)
  const [voortgang, setVoortgang] = React.useState<{ klaar: number; totaal: number } | null>(null)
  const [fouten, setFouten] = React.useState<{ id: string; fout: string }[]>([])

  const geselecteerd = alle.filter(r => gekozen.has(r.id))
  const som = geselecteerd.reduce((t, r) => t + (r._bedrag ?? 0), 0)

  async function afsluiten() {
    const ids = geselecteerd.map(r => r.id)
    setBevestigen(false)
    setFouten([])
    setVoortgang({ klaar: 0, totaal: ids.length })
    const misluktAlles: { id: string; fout: string }[] = []
    for (let i = 0; i < ids.length; i += PORTIE) {
      const portie = ids.slice(i, i + PORTIE)
      const res = await sluitOffertesAf(portie, 'vervallen', reden).catch((e: unknown) => ({
        ok: false as const, error: e instanceof Error ? e.message : 'Onbekende fout',
      }))
      if (!res.ok) misluktAlles.push(...portie.map(id => ({ id, fout: res.error })))
      else misluktAlles.push(...res.resultaat.mislukt)
      setVoortgang({ klaar: Math.min(i + PORTIE, ids.length), totaal: ids.length })
    }
    setFouten(misluktAlles)
    setVoortgang(null)
    setGekozen(new Set(misluktAlles.map(f => f.id)))
    const gelukt = ids.length - new Set(misluktAlles.map(f => f.id)).size
    if (gelukt > 0) toast.success(`${gelukt} ${gelukt === 1 ? 'offerte' : 'offertes'} vervallen, ook in Bouw7`)
    if (misluktAlles.length > 0) toast.error(`${misluktAlles.length} niet gelukt; zie de melding bovenaan`)
    router.refresh()
  }

  // Zijpaneel om een offerte eerst te bekijken of er een uitkomst op te zetten.
  const [geopendId, setGeopendId] = React.useState<string | null>(null)
  const [medewerkers, setMedewerkers] = React.useState<{ id: string; naam: string }[]>([])
  React.useEffect(() => {
    if (geopendId && medewerkers.length === 0) getMedewerkers().then(setMedewerkers).catch(() => {})
  }, [geopendId, medewerkers.length])
  const geopend = props.dossiers.find(d => d.id === geopendId) ?? null
  const naamVan = (id: string) => alle.find(r => r.id === id)?.titel ?? id

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/offertes" className="text-xs font-semibold text-brand-700 underline underline-offset-2">← Terug naar Offertes</Link>
          <h1 className="mt-1 text-xl font-bold text-neutral-900">Opschonen</h1>
          <p className="mt-1 max-w-[72ch] text-[13px] text-neutral-600">
            Open offertes die langer dan drie maanden geleden zijn verzonden. Vink aan wat niet meer
            loopt en laat het in één keer vervallen; Bouw7 gaat mee. Twijfel je, open de offerte en
            leg een uitkomst vast: dan blijft hij in Te doen.
          </p>
        </div>
      </div>

      {fouten.length > 0 && (
        <div className="rounded-[10px] border border-error-300 bg-error-50 p-3 text-[13px] text-error-700">
          <div className="font-semibold">Niet alles is gelukt</div>
          <ul className="mt-1 list-disc pl-5">
            {fouten.map(f => <li key={f.id}>{naamVan(f.id)}: {f.fout}</li>)}
          </ul>
        </div>
      )}

      {!bakken ? (
        <p className="rounded-[10px] border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-500">Laden…</p>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="flex flex-col gap-4">
            <Bak
              titel="Ouder dan een jaar, nooit contact"
              uitleg={`Onder ${eurKort(BAK_A_BEKIJKEN_VANAF)} staan ze aangevinkt; vanaf ${eurKort(BAK_A_BEKIJKEN_VANAF)} bekijk je ze eerst.`}
              rijen={bakken.a}
              gekozen={gekozen}
              onZet={zet}
              onOpen={setGeopendId}
              geopendId={geopendId}
              contacten={contacten!}
              vandaag={vandaag}
            />
            <Bak
              titel="Drie maanden tot een jaar, of ouder met contact"
              uitleg="Per offerte beslissen. Loopt hij nog, open hem en leg de stand vast."
              rijen={bakken.b}
              gekozen={gekozen}
              onZet={zet}
              onOpen={setGeopendId}
              geopendId={geopendId}
              contacten={contacten!}
              vandaag={vandaag}
            />
          </div>
          <OfferteZijpaneel
            dossier={geopend}
            mijnMedewerkerId={props.mijnMedewerkerId}
            medewerkers={medewerkers}
            vandaag={vandaag}
            onSluit={() => setGeopendId(null)}
            onVastgelegd={() => { zet(geopendId ? [geopendId] : [], false); setGeopendId(null); router.refresh() }}
            alleRijen={alle}
            onOpen={setGeopendId}
            grenzen={grenzen}
          />
        </div>
      )}

      {/* Actiebalk onderaan */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(22,27,32,0.06)]">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-3">
          <span className="text-[13px] text-neutral-900">
            <strong className="font-semibold tabular-nums">{geselecteerd.length}</strong> geselecteerd
            <span className="text-neutral-500 tabular-nums"> · {eur(som)}</span>
          </span>
          <label className="flex items-center gap-2 text-xs text-neutral-600">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Reden</span>
            <select
              value={reden}
              onChange={e => setReden(e.target.value)}
              className="h-8 rounded-md border border-neutral-300 bg-white px-2 text-[13px] text-neutral-900"
            >
              {VERVAL_REDENEN.filter(r => r !== 'Anders').map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <div className="ml-auto flex items-center gap-2">
            {voortgang ? (
              <span className="text-[13px] text-neutral-700 tabular-nums">Bezig: {voortgang.klaar} van {voortgang.totaal}…</span>
            ) : bevestigen ? (
              <>
                <span className="text-[13px] text-warning-700">
                  {geselecteerd.length} offertes op vervallen zetten, ook in Bouw7?
                </span>
                <Button variant="ghost" onClick={() => setBevestigen(false)}>Annuleren</Button>
                <Button onClick={() => void afsluiten()}>Ja, laten vervallen</Button>
              </>
            ) : (
              <Button disabled={geselecteerd.length === 0} onClick={() => setBevestigen(true)}>
                Geselecteerde laten vervallen
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Bak(props: {
  titel: string
  uitleg: string
  rijen: TeDoenRij[]
  gekozen: Set<string>
  onZet: (ids: string[], aan: boolean) => void
  onOpen: (id: string) => void
  geopendId: string | null
  contacten: Map<string, LaatsteContact>
  vandaag: string
}) {
  const ids = props.rijen.map(r => r.id)
  const aantalAan = ids.filter(id => props.gekozen.has(id)).length
  const som = props.rijen.reduce((t, r) => t + (r._bedrag ?? 0), 0)
  return (
    <section className="overflow-hidden rounded-[10px] border border-neutral-200 bg-white" aria-label={props.titel}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-neutral-200 bg-neutral-50 px-4 py-2">
        <span className="text-[13px] font-semibold text-neutral-900">{props.titel}</span>
        <span className="text-xs tabular-nums text-neutral-500">{props.rijen.length} · {eurKort(som)}</span>
        <span className="basis-full text-xs text-neutral-500">{props.uitleg}</span>
        {props.rijen.length > 0 && (
          <span className="flex gap-3 text-xs">
            <button type="button" className="font-semibold text-brand-700 underline underline-offset-2" onClick={() => props.onZet(ids, true)}>Alles aanvinken</button>
            <button type="button" className="font-semibold text-brand-700 underline underline-offset-2" disabled={aantalAan === 0} onClick={() => props.onZet(ids, false)}>Niets</button>
          </span>
        )}
      </div>
      {props.rijen.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-neutral-500">Niets in deze groep.</p>
      ) : props.rijen.map(r => {
        const contact = props.contacten.get(r.id)
        const maanden = Math.round((r._openDagen ?? 0) / 30)
        return (
          <div
            key={r.id}
            className={cn(
              'grid grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 border-b border-neutral-100 px-4 py-2 last:border-b-0 md:grid-cols-[16px_minmax(0,2fr)_minmax(0,1.4fr)_96px_64px] md:items-center',
              props.geopendId === r.id && 'bg-brand-50',
            )}
          >
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[var(--brand-500)] md:mt-0"
              checked={props.gekozen.has(r.id)}
              onChange={e => props.onZet([r.id], e.target.checked)}
              aria-label={`${r.titel} laten vervallen`}
            />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold text-neutral-900">{r.titel}</span>
              <span className="block truncate text-xs text-neutral-500">{[r.klant_naam, r.dossiernummer].filter(Boolean).join(' · ')}</span>
            </span>
            <span className="col-start-2 min-w-0 text-xs text-neutral-500 md:col-start-auto">
              <span className="block truncate">
                Verzonden {r.verzonden_op ? kortDatum(r.verzonden_op, props.vandaag) : '—'} · {maanden} mnd
              </span>
              <span className="block truncate">
                {contact ? `Laatste contact ${kortDatum(contact.op, props.vandaag)} · ${contact.kop}` : 'Nooit contact vastgelegd'}
              </span>
            </span>
            <span className="col-start-3 row-start-1 text-right text-[13px] font-semibold tabular-nums text-neutral-900 md:col-start-auto md:row-start-auto">
              {eur(r._bedrag)}
            </span>
            <button
              type="button"
              onClick={() => props.onOpen(r.id)}
              className="col-start-3 text-right text-xs font-semibold text-brand-700 underline underline-offset-2 md:col-start-auto"
            >
              Openen
            </button>
          </div>
        )
      })}
    </section>
  )
}
