'use client'

// Mini-meetstaat: dubbelklik op een hoeveelheid in de calculatie. Opmaak volgt scherm 4
// uit het plan "Meetstaten per object" en het design system (docs/design-system).
// Rekenen en bewaren: lib/everts-calc/mini-meetstaat.ts. Eén meting in meerdere regels:
// lib/everts-calc/mini-meetstaat-koppeling.ts en MiniMeetstaatKoppeling.tsx.

import { useState, useEffect } from 'react'
import { Trash2, ChevronDown, Minus } from 'lucide-react'
import type { Eenheid, MiniMaatrij, MiniMeting } from '@/lib/everts-calc/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ZwevendeLijst } from '@/components/ui/zwevende-lijst'
import { normaliseerEenheid } from '@/lib/everts-calc/maat-rekenen'
import {
  isAlleenAantal, berekenRij, rijHeeftData, legeRij, startToestand, maakMeting, brutoNetto,
  type Gebruik,
} from '@/lib/everts-calc/mini-meetstaat'
import {
  metingKeuzes, gedeeldMet, metingNaam, type MetingKeuze, type RegelMetMeting,
} from '@/lib/everts-calc/mini-meetstaat-koppeling'
import { nieuweId } from '@/lib/everts-calc/utils'
import GetalInvoer from '@/components/everts-calc/meetstaat/GetalInvoer'
import { MetingKoppeling } from './MiniMeetstaatKoppeling'

interface Props {
  open: boolean
  eenheid: Eenheid | string
  hoeveelheid: number
  /** Omschrijving van de calculatieregel, voor de titel. */
  titel?: string
  /** Eerder bewaarde meting van deze regel; de dialog opent daarmee. */
  bewaard?: MiniMeting
  /** Deze regel en de regels van hetzelfde scenario: voor de keuzelijst en de koppeling. */
  regelId?: string
  scenarioRegels?: RegelMetMeting[]
  /** `bronRegelId`: de regel waar een nog losse meting uit de keuzelijst vandaan kwam;
   *  die krijgt dezelfde koppel_id. */
  onBevestig: (hoeveelheid: number, eenheid: Eenheid | undefined, meting: MiniMeting, bronRegelId?: string) => void
  /** Ontkoppelen: alleen deze regel laat de gedeelde meting los. */
  onOntkoppel?: () => void
  onSluiten: () => void
}

const MEET_EENHEDEN = ['m²', 'm¹', 'm³', 'st', 'post', 'uur', 'dag', 'ltr', 'kg', 'set'] as const

const getal = (n: number, dec = 2) =>
  n.toLocaleString('nl-NL', { minimumFractionDigits: dec, maximumFractionDigits: dec })

const datum = (iso: string) =>
  new Date(iso).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })

/** Kolommen na Omschrijving; de laatste twee (Totaal, verwijderen) staan vast. */
function maatKolommen(eenh: string): { label: string; title: string; veld: 'dim1' | 'dim2' | 'dim3' | 'factor' }[] {
  if (eenh === 'm²') return [
    { label: 'B', title: 'Breedte (m)', veld: 'dim1' },
    { label: 'H', title: 'Hoogte (m)', veld: 'dim2' },
    { label: 'Aantal', title: 'Aantal gelijke vlakken', veld: 'factor' },
  ]
  if (eenh === 'm³') return [
    { label: 'L', title: 'Lengte (m)', veld: 'dim1' },
    { label: 'B', title: 'Breedte (m)', veld: 'dim2' },
    { label: 'H', title: 'Hoogte (m)', veld: 'dim3' },
    { label: 'Aantal', title: 'Aantal', veld: 'factor' },
  ]
  if (eenh === 'm¹') return [
    { label: 'L', title: 'Lengte (m)', veld: 'dim1' },
    { label: 'Aantal', title: 'Aantal', veld: 'factor' },
  ]
  return [{ label: 'Aantal', title: 'Aantal', veld: 'dim1' }]
}

function formule(eenh: string): string {
  if (eenh === 'm²') return 'B × H × aantal'
  if (eenh === 'm³') return 'L × B × H × aantal'
  if (eenh === 'm¹') return 'L × aantal'
  return 'som van de aantallen'
}

const veldKlas =
  'h-8 w-full rounded-md border border-neutral-300 bg-white px-2 text-[13px] text-neutral-900 ' +
  'placeholder:text-neutral-400 hover:border-neutral-400 focus:border-brand-500 focus:outline-none ' +
  'focus:ring-[3px] focus:ring-brand-100'

const kopKlas = 'px-2 py-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500'

// ─── Eén rij ──────────────────────────────────────────────────────────────────

function MaatRij({ rij, eenh, totaal, isLeeg, onChange, onVerwijder }: {
  rij: MiniMaatrij
  eenh: string
  totaal: number
  isLeeg: boolean
  onChange: (patch: Partial<MiniMaatrij>) => void
  onVerwijder: () => void
}) {
  return (
    <tr className={`group/rij border-t border-neutral-100 ${rij.aftrek ? 'bg-neutral-50' : ''}`}>
      <td className="w-9 py-1.5 pl-2">
        <button
          type="button"
          onClick={() => onChange({ aftrek: !rij.aftrek })}
          aria-pressed={!!rij.aftrek}
          title={rij.aftrek ? 'Aftrekregel: telt negatief mee in netto. Klik om weer op te tellen.' : 'Maak hier een aftrekregel van (bv. ramen uit een gevelvlak)'}
          className={`grid h-7 w-7 place-items-center rounded-md border text-xs font-semibold transition-colors
            focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-100 ${
            rij.aftrek
              ? 'border-warning-300 bg-warning-50 text-warning-700'
              : 'border-neutral-200 text-neutral-400 hover:border-neutral-300 hover:text-neutral-700'}`}
        >
          {rij.aftrek ? <Minus className="h-3.5 w-3.5" /> : '+'}
        </button>
      </td>
      <td className="px-2 py-1.5">
        <input
          type="text"
          value={rij.omschrijving}
          placeholder={isLeeg ? 'Nieuwe maat, bv. Gevelvlak' : rij.aftrek ? 'Aftrek, bv. Ramen' : 'Omschrijving'}
          className={`${veldKlas} ${isLeeg ? 'border-dashed' : ''}`}
          onChange={e => onChange({ omschrijving: e.target.value })}
        />
      </td>
      {maatKolommen(eenh).map(k => (
        <td key={k.veld} className="w-20 px-1 py-1.5">
          <GetalInvoer
            value={rij[k.veld]}
            onChange={v => onChange({ [k.veld]: v ?? 0 })}
            placeholder={k.veld === 'factor' ? '1' : '0'}
            className={`${veldKlas} text-right tabular-nums`}
          />
        </td>
      ))}
      <td className={`w-24 px-2 py-1.5 text-right font-mono text-[13px] tabular-nums ${rij.aftrek ? 'text-warning-700' : 'text-neutral-900'}`}>
        {totaal > 0 ? `${rij.aftrek ? '−' : ''}${getal(totaal)}` : <span className="text-neutral-300">—</span>}
      </td>
      <td className="w-8 px-1 py-1.5 text-center">
        {!isLeeg && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onVerwijder}
            title="Rij verwijderen"
            className="text-neutral-400 opacity-0 hover:text-error-700 group-hover/rij:opacity-100 focus-visible:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </td>
    </tr>
  )
}

// ─── Eenheid kiezen ───────────────────────────────────────────────────────────

function EenheidKiezer({ huidig, onChange }: { huidig: string; onChange: (e: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <ZwevendeLijst
      open={open}
      onSluit={() => setOpen(false)}
      breedte={208}
      className="flex flex-wrap gap-1 p-2"
      anker={
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="inline-flex items-center gap-1 rounded-md border border-brand-100 bg-brand-50 px-2 py-0.5
            text-xs font-semibold text-brand-700 hover:bg-brand-100"
        >
          {huidig || 'kies'}
          <ChevronDown className="h-3 w-3" />
        </button>
      }
    >
      {MEET_EENHEDEN.map(e => (
        <button
          key={e}
          type="button"
          onClick={() => { onChange(e); setOpen(false) }}
          className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
            huidig === e
              ? 'border-brand-500 bg-brand-500 text-white'
              : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50'
          }`}
        >
          {e}
        </button>
      ))}
    </ZwevendeLijst>
  )
}

// ─── Dialog ───────────────────────────────────────────────────────────────────

export default function MiniMeetstaat({
  open, eenheid, hoeveelheid, titel, bewaard, regelId = '', scenarioRegels = [], onBevestig, onOntkoppel, onSluiten,
}: Props) {
  const [gekozenEenheid, setGekozenEenheid] = useState<string>(normaliseerEenheid(eenheid))
  const [rijen, setRijen] = useState<MiniMaatrij[]>([legeRij()])
  const [afwijking, setAfwijking] = useState<{ meting: number; calculatie: number } | null>(null)
  const [gebruik, setGebruik] = useState<Gebruik>('netto')
  const [koppelId, setKoppelId] = useState<string | undefined>()
  const [bronRegelId, setBronRegelId] = useState<string | undefined>()
  const [naam, setNaam] = useState('')

  // Bij openen: de bewaarde meting, of anders de bestaande hoeveelheid als eerste rij.
  useEffect(() => {
    if (!open) return
    // 'm2' uit de bibliotheek is gewoon m²; anders valt de rij terug op alleen een aantal.
    const eenh = normaliseerEenheid(eenheid)
    const start = startToestand(bewaard, hoeveelheid, eenh)
    setGekozenEenheid(eenh)
    setRijen(start.rijen)
    setGebruik(start.gebruik)
    setAfwijking(start.afwijking)
    // Een meting in een andere eenheid opent niet, en dus ook zijn koppeling en naam niet.
    const zelfde = bewaard && normaliseerEenheid(bewaard.eenheid) === eenh
    setKoppelId(zelfde ? bewaard.koppel_id : undefined)
    setNaam(zelfde ? bewaard.naam ?? '' : '')
    setBronRegelId(undefined)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Altijd een lege rij onderaan om in te typen.
  useEffect(() => {
    if (rijHeeftData(rijen[rijen.length - 1])) setRijen(rs => [...rs, legeRij()])
  }, [rijen])

  // Andere eenheid: de maten zijn niet om te rekenen, dus opnieuw beginnen.
  const kiesEenheid = (e: string) => {
    setGekozenEenheid(e)
    setRijen([legeRij()])
    setAfwijking(null)
    setNaam('')
    setKoppelId(undefined)
    setBronRegelId(undefined)
  }

  // Andere metingen in dit scenario, en de regels waarmee deze meting gedeeld is.
  const keuzes = metingKeuzes(scenarioRegels, regelId, gekozenEenheid, koppelId)
    .filter(k => k.bronRegelId !== bronRegelId)
  const bron = scenarioRegels.find(r => r.id === bronRegelId)
  const gedeeld = [...gedeeldMet(scenarioRegels, regelId, koppelId), ...(bron ? [bron] : [])]
    .map(r => r.omschrijving.trim() || 'Regel zonder omschrijving')

  // Overnemen uit de lijst: de maten en de koppeling; bruto of netto blijft van deze regel.
  const kiesMeting = (k: MetingKeuze) => {
    setRijen([...k.meting.rijen, legeRij()])
    setNaam(k.naam)
    setKoppelId(k.koppelId ?? nieuweId())
    setBronRegelId(k.koppelId ? undefined : k.bronRegelId)
    setAfwijking(null)
  }

  const ontkoppel = () => { setKoppelId(undefined); setBronRegelId(undefined); onOntkoppel?.() }

  const totalen = rijen.map(r => berekenRij(r, gekozenEenheid))
  const bn = brutoNetto(rijen, gekozenEenheid)
  const eindtotaal = gebruik === 'bruto' || !bn.heeftAftrek ? bn.bruto : bn.netto

  const wijzigRij = (id: string, patch: Partial<MiniMaatrij>) =>
    setRijen(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r))
  const verwijderRij = (id: string) =>
    setRijen(rs => rs.length > 1 ? rs.filter(r => r.id !== id) : rs)

  const overnemen = () => {
    if (eindtotaal <= 0) return
    const eenheidGewijzigd = gekozenEenheid !== eenheid
    const meting: MiniMeting = {
      ...maakMeting(rijen, gekozenEenheid, gebruik),
      // Zelf ingevuld, anders de eerste maat (niet de regel: die past niet bij andere regels).
      naam: naam.trim() || metingNaam(rijen.filter(rijHeeftData), ''),
      // Een koppeling zonder andere regels is geen koppeling.
      ...(koppelId && gedeeld.length > 0 ? { koppel_id: koppelId } : {}),
    }
    onBevestig(eindtotaal, eenheidGewijzigd ? gekozenEenheid as Eenheid : undefined, meting, bronRegelId)
  }

  const kolommen = maatKolommen(gekozenEenheid)

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onSluiten() }}>
      <DialogContent size="lg" onOpenAutoFocus={e => e.preventDefault()} className="flex max-h-[80vh] flex-col">
        <DialogHeader>
          <div className="min-w-0 pr-10">
            <DialogTitle className="truncate">Meten{titel ? ` · ${titel}` : ''}</DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-2">
              <span>Eenheid</span>
              <EenheidKiezer huidig={gekozenEenheid} onChange={kiesEenheid} />
              {gekozenEenheid && <span>· {formule(gekozenEenheid)}</span>}
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          {gekozenEenheid && (
            <MetingKoppeling
              keuzes={keuzes} gedeeldMet={gedeeld} onKies={kiesMeting} onOntkoppel={ontkoppel}
              naam={naam} naamVoorstel={metingNaam(rijen.filter(rijHeeftData), '')} onNaam={setNaam}
            />
          )}

          {afwijking && (
            <Alert tone="warning" title="De hoeveelheid is met de hand aangepast">
              In de calculatie staat {getal(afwijking.calculatie)} {gekozenEenheid}, deze meting telt op
              tot {getal(afwijking.meting)}. Overnemen zet de meting terug in de calculatie; Annuleren
              laat de calculatie zoals hij is.
            </Alert>
          )}

          {!gekozenEenheid ? (
            <div className="flex flex-wrap justify-center gap-2 py-8">
              {MEET_EENHEDEN.map(e => (
                <Button key={e} variant={isAlleenAantal(e) ? 'outline' : 'secondary'} size="md" onClick={() => setGekozenEenheid(e)}>
                  {e}
                </Button>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-neutral-200">
              <table className="w-full min-w-[600px] border-collapse">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="w-9" aria-label="Optellen of aftrekken" />
                    <th className={`${kopKlas} text-left`}>Omschrijving</th>
                    {kolommen.map(k => (
                      <th key={k.veld} title={k.title} className={`${kopKlas} text-right`}>{k.label}</th>
                    ))}
                    <th className={`${kopKlas} text-right`}>Totaal</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {rijen.map((rij, i) => (
                    <MaatRij
                      key={rij.id}
                      rij={rij}
                      eenh={gekozenEenheid}
                      totaal={totalen[i]}
                      isLeeg={i === rijen.length - 1 && !rijHeeftData(rij)}
                      onChange={patch => wijzigRij(rij.id, patch)}
                      onVerwijder={() => verwijderRij(rij.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {gekozenEenheid && bn.heeftAftrek && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-neutral-600">Gebruik in deze regel:</span>
              <div role="radiogroup" aria-label="Bruto of netto" className="inline-flex rounded-md border border-neutral-300 p-0.5">
                {([['bruto', bn.bruto], ['netto', bn.netto]] as const).map(([k, waarde]) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={gebruik === k}
                    onClick={() => setGebruik(k)}
                    className={`rounded px-3 py-1 text-[13px] font-medium transition-colors
                      focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-100 ${
                      gebruik === k ? 'bg-brand-500 text-white' : 'text-neutral-700 hover:bg-neutral-100'}`}
                  >
                    {k === 'bruto' ? 'Bruto' : 'Netto'}{' '}
                    <span className="font-mono tabular-nums">{getal(waarde)} {gekozenEenheid}</span>
                  </button>
                ))}
              </div>
              <span className="text-xs text-neutral-500">
                {gebruik === 'bruto' ? 'Hele vlak, bv. steigerwerk.' : 'Zonder de aftrekregels, bv. reinigen of voegen.'}
              </span>
            </div>
          )}
        </DialogBody>

        <DialogFooter split className="flex-wrap border-t border-neutral-100 bg-neutral-50">
          <span className="text-xs text-neutral-500">
            {gedeeld.length > 0
              ? `Gedeelde meting · Overnemen werkt ook ${gedeeld.length} andere ${gedeeld.length === 1 ? 'regel' : 'regels'} bij`
              : bewaard?.rijen.length
              ? `Bewaard bij deze regel · gemeten ${datum(bewaard.gemeten_op)}`
              : 'De maten worden bij deze regel bewaard'}
          </span>
          <div className="flex items-center gap-3">
            <span className="whitespace-nowrap font-mono text-sm font-semibold tabular-nums text-neutral-900">
              {eindtotaal > 0 ? `${getal(eindtotaal)} ${gekozenEenheid}` : '—'}
            </span>
            <Button variant="ghost" size="md" onClick={onSluiten}>Annuleren</Button>
            <Button variant="primary" size="md" onClick={overnemen} disabled={eindtotaal <= 0}>Overnemen</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
