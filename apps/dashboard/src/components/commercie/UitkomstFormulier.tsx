'use client'

/**
 * "Wat is er gebeurd?" — kies een uitkomst, vul aan wat die uitkomst nodig heeft, leg vast.
 *
 * Gedeeld door de dialoog op het tabblad Bewaking en het zijpaneel in "Te doen". Twee schermen
 * die hetzelfde vastleggen moeten dezelfde vragen stellen, anders komen er twee soorten
 * antwoorden in dezelfde tijdlijn.
 *
 * Met `sneltoetsen` kies je een uitkomst met 1 t/m 8 en leg je vast met Ctrl/Cmd+Enter. Dat is
 * voor de belronde: wie twintig offertes nabelt, wil niet twintig keer naar de muis.
 */

import * as React from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { cn } from '@everts/ui'
import { datumNaarISO } from '@/lib/dossiers/datum-regels'
import {
  UITKOMSTEN, VERLIES_REDENEN, verkoopkansCompleet, notitieVerplicht, LEGE_VERKOOPKANS,
  type UitkomstDefinitie, type VerkoopkansInvoer,
} from '@/lib/commercie/types'
import { legUitkomstVast } from '@/lib/commercie/actions'
import { VerkoopkansVelden } from './VerkoopkansVelden'

type Medewerker = { id: string; naam: string }

type Props = {
  dossierId: string
  medewerkers: Medewerker[]
  /** Na een geslaagde vastlegging. */
  onVastgelegd: () => void
  /** Vlak vóór onVastgelegd, met de notitie: bv. om hem ook op meebesproken offertes te zetten. */
  naVastleggen?: (notitie: string) => Promise<void>
  /** Toont een Annuleren-knop; zonder deze prop staat er alleen Vastleggen. */
  onAnnuleer?: () => void
  /** 1 t/m 8 kiest een uitkomst, Ctrl/Cmd+Enter legt vast. */
  sneltoetsen?: boolean
  /** Uitkomstknoppen in twee kolommen zonder uitleg: voor het smalle zijpaneel. */
  compact?: boolean
}

export function UitkomstFormulier(props: Props) {
  const [gekozen, setGekozen] = React.useState<UitkomstDefinitie | null>(null)
  const [tekst, setTekst] = React.useState('')
  const [datum, setDatum] = React.useState<Date | undefined>()
  const [actiehouder, setActiehouder] = React.useState('')
  const [reden, setReden] = React.useState('')
  const [toelichting, setToelichting] = React.useState('')
  /**
   * De kans die overblijft. Bij 'uitgesteld' verplicht — uitgesteld werk zonder houder en datum
   * is een ander woord voor vergeten werk — en bij 'verloren' aangeboden achter een knop.
   */
  const [kansOpen, setKansOpen] = React.useState(false)
  const [kans, setKans] = React.useState<VerkoopkansInvoer>(LEGE_VERKOOPKANS)
  const [bezig, setBezig] = React.useState(false)
  const notitieRef = React.useRef<HTMLInputElement>(null)

  // Een ander dossier: schoon beginnen, anders landt een halve notitie bij de volgende offerte.
  React.useEffect(() => {
    setGekozen(null); setTekst(''); setDatum(undefined)
    setActiehouder(''); setReden(''); setToelichting('')
    setKansOpen(false); setKans(LEGE_VERKOOPKANS)
  }, [props.dossierId])

  // De herbenaderdatum is meteen de deadline van de kans: bij uitstel is dat per definitie
  // hetzelfde moment, en twee keer dezelfde datum laten kiezen nodigt uit tot verschillen.
  React.useEffect(() => {
    if (!datum) return
    setKans(k => (k.deadline ? k : { ...k, deadline: datumNaarISO(datum) }))
  }, [datum])

  // Bij een uitkomst die een kans afdwingt staat het blok meteen open; hem eerst moeten
  // opzoeken achter een knop zou de verplichting onzichtbaar maken.
  React.useEffect(() => {
    setKansOpen(gekozen?.vraagtVerkoopkans === true)
    setKans(LEGE_VERKOOPKANS)
    if (gekozen) setTimeout(() => notitieRef.current?.focus(), 0)
  }, [gekozen])

  const notitieOntbreekt = gekozen != null && notitieVerplicht(gekozen.sleutel) && !tekst.trim()
  const kanVastleggen =
    gekozen != null && !bezig && !notitieOntbreekt && !(kansOpen && !verkoopkansCompleet(kans))

  const vastleggen = React.useCallback(async () => {
    if (!gekozen || !kanVastleggen) return
    setBezig(true)
    const res = await legUitkomstVast(props.dossierId, {
      uitkomst: gekozen.sleutel,
      tekst: tekst || null,
      stapDatum: datum ? datumNaarISO(datum) : null,
      actiehouderId: actiehouder || null,
      reden: reden || null,
      redenToelichting: toelichting || null,
      verkoopkans: kansOpen && verkoopkansCompleet(kans) ? kans : null,
    })
    setBezig(false)
    if (!res.ok) { toast.error(res.error); return }
    if (props.naVastleggen && tekst.trim()) await props.naVastleggen(tekst.trim()).catch(() => {})
    toast.success(`${gekozen.label} vastgelegd`)
    props.onVastgelegd()
  }, [gekozen, kanVastleggen, props, tekst, datum, actiehouder, reden, toelichting, kansOpen, kans])

  React.useEffect(() => {
    if (!props.sneltoetsen) return
    function opToets(e: KeyboardEvent) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void vastleggen(); return }
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      // Binnen de datumkiezer zijn cijfers geen uitkomstkeuze.
      if ((e.target as HTMLElement | null)?.closest?.('[data-radix-popper-content-wrapper]')) return
      const n = Number(e.key)
      if (Number.isInteger(n) && n >= 1 && n <= UITKOMSTEN.length) setGekozen(UITKOMSTEN[n - 1])
    }
    window.addEventListener('keydown', opToets)
    return () => window.removeEventListener('keydown', opToets)
  }, [props.sneltoetsen, vastleggen])

  return (
    <div className="space-y-3">
      <div className={cn('grid gap-2', props.compact && 'grid-cols-2')}>
        {UITKOMSTEN.map((u, i) => (
          <button
            key={u.sleutel}
            type="button"
            onClick={() => setGekozen(u)}
            aria-pressed={gekozen?.sleutel === u.sleutel}
            className={cn(
              'flex items-start gap-2 rounded-lg border px-3 py-2 text-left hover:border-brand-500 hover:bg-neutral-50',
              gekozen?.sleutel === u.sleutel ? 'border-brand-500 bg-brand-50' : 'border-neutral-200',
            )}
          >
            {props.sneltoetsen && (
              <kbd className="mt-0.5 rounded border border-neutral-300 px-1 font-mono text-[10.5px] text-neutral-500">{i + 1}</kbd>
            )}
            <span>
              <span className="block text-[13px] font-medium text-neutral-900">{u.label}</span>
              {!props.compact && <span className="block text-xs text-neutral-500">{u.gevolg}</span>}
            </span>
          </button>
        ))}
      </div>

      {gekozen && (
        <div className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-xs text-neutral-600">{gekozen.gevolg}</p>

          <Label tekst={notitieVerplicht(gekozen.sleutel) ? 'Wat is er besproken?' : 'Notitie (optioneel)'}>
            <Input
              ref={notitieRef}
              value={tekst}
              onChange={e => setTekst(e.target.value)}
              placeholder="Kort en feitelijk. Dit leest de volgende die belt."
            />
          </Label>

          {gekozen.vraagtDatum && (
            <Label tekst={gekozen.sleutel === 'ligt_bij_alv'
              ? 'Wanneer controleren we het? (kies de dag ná de vergadering)'
              : 'Wanneer benaderen we de klant opnieuw?'}>
              <DatePicker value={datum} onChange={setDatum} />
            </Label>
          )}

          {gekozen.vraagtActiehouder && (
            <Label tekst="Wie pakt dit op?">
              <select
                className="h-8 w-full rounded-md border border-neutral-300 bg-white px-2 text-[13px]"
                value={actiehouder}
                onChange={e => setActiehouder(e.target.value)}
              >
                <option value="">Kies een collega…</option>
                {props.medewerkers.map(m => <option key={m.id} value={m.id}>{m.naam}</option>)}
              </select>
            </Label>
          )}

          {gekozen.vraagtReden && (
            <>
              <Label tekst="Waarom is de offerte niet doorgegaan?">
                <select
                  className="h-8 w-full rounded-md border border-neutral-300 bg-white px-2 text-[13px]"
                  value={reden}
                  onChange={e => setReden(e.target.value)}
                >
                  <option value="">Kies een reden…</option>
                  {VERLIES_REDENEN.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </Label>
              {reden === 'Anders' && (
                <Label tekst="Licht kort toe">
                  <Input value={toelichting} onChange={e => setToelichting(e.target.value)} />
                </Label>
              )}
              <p className="text-xs text-neutral-500">
                Komt het werk later terug? Kies dan <strong>Uitgesteld</strong> in plaats van
                Verloren — dan blijft de offerte zelf in bewaking. Gaat het werk wél van tafel
                maar komt de klant later terug, leg dan hieronder een verkoopkans vast.
              </p>
            </>
          )}

          {/* De kans die overblijft. Verplicht bij uitstel, aangeboden bij verlies. */}
          {(gekozen.vraagtVerkoopkans || gekozen.biedtVerkoopkans) && (
            kansOpen ? (
              <div className="rounded-lg border border-brand-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[13px] font-medium text-neutral-900">Verkoopkans</span>
                  {!gekozen.vraagtVerkoopkans && (
                    <button
                      type="button"
                      className="text-xs text-neutral-500 underline"
                      onClick={() => { setKansOpen(false); setKans(LEGE_VERKOOPKANS) }}
                    >
                      Toch niet
                    </button>
                  )}
                </div>
                <VerkoopkansVelden waarde={kans} onChange={setKans} medewerkers={props.medewerkers} />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-neutral-300 bg-white px-3 py-2">
                <p className="text-xs text-neutral-600">
                  Komt dit werk later terug? Leg het nu vast, anders verdwijnt het met dit dossier.
                </p>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => setKansOpen(true)}>
                  Verkoopkans aanmaken
                </Button>
              </div>
            )
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            {props.onAnnuleer && <Button variant="ghost" onClick={props.onAnnuleer}>Annuleren</Button>}
            <Button disabled={!kanVastleggen} onClick={() => void vastleggen()}>
              {bezig ? 'Bezig…' : 'Vastleggen'}
              {props.sneltoetsen && <span className="ml-1 text-[11px] opacity-70">Ctrl+Enter</span>}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function Label({ tekst, children }: { tekst: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-neutral-500">{tekst}</span>
      {children}
    </label>
  )
}
