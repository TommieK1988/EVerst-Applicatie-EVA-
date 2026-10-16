'use client'

/**
 * De bewakingskaart: wat speelt er, wie is aan zet, en wat gebeurt er hierna.
 *
 * De kaart is bewust de énige plek waar de volgende stap wordt onderhouden. Daarom zitten er
 * precies twee knoppen op: "Uitkomst vastleggen" (na een klantcontact — het pad dat 95% van
 * de tijd gebruikt wordt) en "Volgende actie" (voor de losse velden). Meer keuzes maken het
 * langzamer, niet completer.
 */

import * as React from 'react'
import toast from 'react-hot-toast'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@everts/ui'
import { formatDatumNL, datumNaarISO } from '@/lib/dossiers/datum-regels'
import {
  STATUS_PRESENTATIE, stapOmschrijving,
  type BewakingKaart, type BewakingStatus,
} from '@/lib/commercie/types'
import { slaStapOp } from '@/lib/commercie/actions'
import { zetCommercieelEigenaar } from '@/lib/commercie/eigenaar'
import { UitkomstFormulier } from './UitkomstFormulier'

type Medewerker = { id: string; naam: string }

/** De keuzes bij "kans op opdracht". Stappen van 5%; 0 en 100 horen erbij als bewuste uitersten. */
const KANS_STAPPEN = Array.from({ length: 21 }, (_, i) => i * 5)

type Props = {
  dossierId: string
  kaart: BewakingKaart | null
  status: BewakingStatus
  eigenaarNaam: string | null
  actiehouderNaam: string | null
  afgerond: boolean
  medewerkers: Medewerker[]
  /** Uit het dossier, puur ter weergave. */
  bedrag: number | null
  klant: string | null
}

const eur = (n: number | null) =>
  n == null ? '—' : new Intl.NumberFormat('nl-NL', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(n)

export function BewakingPaneel(props: Props) {
  const { dossierId, kaart, status, afgerond, medewerkers } = props
  const [uitkomstOpen, setUitkomstOpen] = React.useState(false)
  const [aanpassenOpen, setAanpassenOpen] = React.useState(false)

  const pres = STATUS_PRESENTATIE[status]
  const stap = kaart ? stapOmschrijving(kaart) : null

  return (
    <>
      <Card>
        {/* Géén eigen tekstkleur hier: CardHeader zet een merkkleur-band met een daarop
            afgestemde tekstkleur, en die band blijft in donkere modus licht. Een eigen
            `text-neutral-*` kantelt wél mee en wordt dan wit op lichtgroen — onleesbaar. */}
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', pres.stip)} aria-hidden />
            <span className="text-sm font-semibold">{pres.label}</span>
            <span className="text-xs opacity-70">{pres.uitleg}</span>
          </div>
          {!afgerond && (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setUitkomstOpen(true)}>Uitkomst vastleggen</Button>
              <Button size="sm" variant="outline" onClick={() => setAanpassenOpen(true)}>Volgende actie</Button>
            </div>
          )}
        </CardHeader>

        <CardBody className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <Veld label="Offertebedrag" waarde={eur(props.bedrag)} />
          <Veld label="Klant" waarde={props.klant ?? '—'} />
          {afgerond ? (
            <Veld label="Commercieel eigenaar" waarde={props.eigenaarNaam ?? 'Nog niet bepaald'} />
          ) : (
            <EigenaarVeld
              dossierId={dossierId}
              eigenaarId={kaart?.eigenaar_id ?? null}
              medewerkers={medewerkers}
            />
          )}
          <Veld label="Nu aan zet" waarde={props.actiehouderNaam ?? '—'} />

          <div className="sm:col-span-2 lg:col-span-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Volgende stap
            </div>
            <div className="mt-0.5 text-sm text-neutral-900">
              {stap ?? (
                <span className="text-neutral-500">
                  Nog niets afgesproken. Leg een uitkomst vast of stel een eigenaar en
                  vervolgstap in — anders raakt deze offerte uit beeld.
                </span>
              )}
            </div>
            {/* Komt de stap uit de actielijst, dan is dat nog geen commerciële afspraak: hij is
                overgenomen zodat de offerte niet ten onrechte als onbeoordeeld oogt. Zeg dat er
                dan ook bij, anders leest een openstaande taak als een bewuste keuze. */}
            {stap && kaart?.stap_bron === 'actie' && (
              <div className="mt-1 text-xs text-neutral-500">
                Overgenomen uit de actielijst van dit dossier. Leg een uitkomst vast zodra je
                klant hebt gesproken — dan vinkt EVA die actie mee af.
              </div>
            )}
          </div>

          {(kaart?.kans_pct != null || kaart?.verwachte_opdracht) && (
            <>
              <Veld label="Kans" waarde={kaart?.kans_pct != null ? `${kaart.kans_pct}%` : '—'} />
              <Veld
                label="Verwachte opdracht"
                waarde={kaart?.verwachte_opdracht ? formatDatumNL(kaart.verwachte_opdracht) : '—'}
              />
            </>
          )}
        </CardBody>
      </Card>

      <UitkomstDialoog
        open={uitkomstOpen}
        onOpenChange={setUitkomstOpen}
        dossierId={dossierId}
        medewerkers={medewerkers}
      />
      <AanpassenDialoog
        open={aanpassenOpen}
        onOpenChange={setAanpassenOpen}
        dossierId={dossierId}
        kaart={kaart}
        medewerkers={medewerkers}
      />
    </>
  )
}

function Veld({ label, waarde }: { label: string; waarde: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-0.5 truncate text-sm text-neutral-900" title={waarde}>{waarde}</div>
    </div>
  )
}

/**
 * De eigenaar is direct op de kaart te wijzigen: hem omzetten hoort niet te vragen om ook een
 * volgende stap in te vullen, zoals de dialoog "Volgende actie" doet.
 */
function EigenaarVeld(props: { dossierId: string; eigenaarId: string | null; medewerkers: Medewerker[] }) {
  const [waarde, setWaarde] = React.useState(props.eigenaarId ?? '')
  const [bezig, setBezig] = React.useState(false)
  React.useEffect(() => setWaarde(props.eigenaarId ?? ''), [props.eigenaarId])

  async function wijzig(nieuw: string) {
    const vorige = waarde
    setWaarde(nieuw)
    setBezig(true)
    const res = await zetCommercieelEigenaar(props.dossierId, nieuw || null)
    setBezig(false)
    if (res.ok) toast.success('Eigenaar opgeslagen')
    else { setWaarde(vorige); toast.error(res.error) }
  }

  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        Commercieel eigenaar
      </span>
      <select
        className="mt-0.5 h-8 w-full rounded-md border border-neutral-300 bg-white px-2 text-[13px] disabled:opacity-60"
        value={waarde}
        disabled={bezig}
        onChange={e => wijzig(e.target.value)}
      >
        <option value="">Nog niet bepaald</option>
        {props.medewerkers.map(m => <option key={m.id} value={m.id}>{m.naam}</option>)}
      </select>
    </label>
  )
}

// ── Uitkomst vastleggen ──────────────────────────────────────────────────────

/** De dialoog om het gedeelde formulier heen; het zijpaneel in "Te doen" gebruikt hetzelfde. */
function UitkomstDialoog(props: {
  open: boolean
  onOpenChange: (v: boolean) => void
  dossierId: string
  medewerkers: Medewerker[]
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent size="md">
        {/* Titel en omschrijving in één div: DialogHeader is `flex justify-between` en zet
            losse kinderen naast elkaar, met de titel in een smalle kolom als gevolg. */}
        <DialogHeader>
          <div className="pr-8">
            <DialogTitle>Wat is er gebeurd?</DialogTitle>
            <DialogDescription>
              Kies één uitkomst. EVA zet daarna zelf de fase, de volgende stap en de datum klaar.
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogBody>
          {/* Alleen gemonteerd zolang de dialoog open is: zo begint elke opening schoon. */}
          {props.open && (
            <UitkomstFormulier
              dossierId={props.dossierId}
              medewerkers={props.medewerkers}
              onVastgelegd={() => props.onOpenChange(false)}
              onAnnuleer={() => props.onOpenChange(false)}
            />
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

// ── Losse velden aanpassen ───────────────────────────────────────────────────

function AanpassenDialoog(props: {
  open: boolean
  onOpenChange: (v: boolean) => void
  dossierId: string
  kaart: BewakingKaart | null
  medewerkers: Medewerker[]
}) {
  const k = props.kaart
  const [eigenaar, setEigenaar] = React.useState(k?.eigenaar_id ?? '')
  const [actiehouder, setActiehouder] = React.useState(k?.actiehouder_id ?? '')
  const [stapSoort, setStapSoort] = React.useState<'actie' | 'wachten'>(k?.stap_soort ?? 'actie')
  const [stapTekst, setStapTekst] = React.useState(k?.stap_tekst ?? '')
  const [wachtOp, setWachtOp] = React.useState(k?.wacht_op ?? 'klant')
  const [datum, setDatum] = React.useState<Date | undefined>(
    k?.stap_datum ? new Date(`${k.stap_datum}T12:00:00`) : undefined,
  )
  const [kans, setKans] = React.useState(k?.kans_pct != null ? String(k.kans_pct) : '')
  const [bezig, setBezig] = React.useState(false)

  React.useEffect(() => {
    if (!props.open) return
    setEigenaar(k?.eigenaar_id ?? '')
    setActiehouder(k?.actiehouder_id ?? '')
    setStapSoort(k?.stap_soort ?? 'actie')
    setStapTekst(k?.stap_tekst ?? '')
    setWachtOp(k?.wacht_op ?? 'klant')
    setDatum(k?.stap_datum ? new Date(`${k.stap_datum}T12:00:00`) : undefined)
    setKans(k?.kans_pct != null ? String(k.kans_pct) : '')
  }, [props.open, k])

  async function opslaan() {
    if (!stapTekst.trim() || !datum || !actiehouder) {
      toast.error('Een volgende stap heeft een omschrijving, een datum en iemand die hem oppakt.')
      return
    }
    setBezig(true)
    const res = await slaStapOp(props.dossierId, {
      eigenaarId: eigenaar || null,
      actiehouderId: actiehouder,
      stapSoort,
      stapTekst: stapTekst.trim(),
      stapDatum: datumNaarISO(datum),
      wachtOp: stapSoort === 'wachten' ? (wachtOp as 'klant' | 'intern' | 'extern') : null,
      kansPct: kans === '' ? null : Number(kans),
    })
    setBezig(false)
    if (res.ok) {
      toast.success('Opgeslagen')
      props.onOpenChange(false)
    } else {
      toast.error(res.error)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <div className="pr-8">
            <DialogTitle>Volgende actie</DialogTitle>
            <DialogDescription>
              Iedere lopende offerte heeft een eigenaar, een volgende beweging en een datum.
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <Label tekst="Commercieel eigenaar">
            <select
              className="h-8 w-full rounded-md border border-neutral-300 bg-white px-2 text-[13px]"
              value={eigenaar} onChange={e => setEigenaar(e.target.value)}
            >
              <option value="">Nog niet bepaald</option>
              {props.medewerkers.map(m => <option key={m.id} value={m.id}>{m.naam}</option>)}
            </select>
          </Label>

          <Label tekst="Wat is de volgende stap?">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStapSoort('actie')}
                className={cn('flex-1 rounded-md border px-2 py-1.5 text-xs',
                  stapSoort === 'actie'
                    ? 'border-brand-500 bg-brand-50 font-medium text-brand-700'
                    : 'border-neutral-300 text-neutral-700')}
              >
                Wij zijn aan zet
              </button>
              <button
                type="button"
                onClick={() => setStapSoort('wachten')}
                className={cn('flex-1 rounded-md border px-2 py-1.5 text-xs',
                  stapSoort === 'wachten'
                    ? 'border-brand-500 bg-brand-50 font-medium text-brand-700'
                    : 'border-neutral-300 text-neutral-700')}
              >
                Wij wachten
              </button>
            </div>
          </Label>

          {stapSoort === 'wachten' && (
            <Label tekst="Bij wie ligt de bal?">
              <select
                className="h-8 w-full rounded-md border border-neutral-300 bg-white px-2 text-[13px]"
                value={wachtOp} onChange={e => setWachtOp(e.target.value as typeof wachtOp)}
              >
                <option value="klant">De klant</option>
                <option value="intern">Een collega</option>
                <option value="extern">Een derde partij</option>
              </select>
            </Label>
          )}

          <Label tekst={stapSoort === 'wachten' ? 'Waar wachten we op?' : 'Wat moet er gebeuren?'}>
            <Input value={stapTekst} onChange={e => setStapTekst(e.target.value)} />
          </Label>

          <Label tekst={stapSoort === 'wachten' ? 'Wanneer controleren we het?' : 'Uiterlijk op'}>
            <DatePicker value={datum} onChange={setDatum} />
          </Label>

          <Label tekst={stapSoort === 'wachten' ? 'Wie controleert het?' : 'Wie pakt dit op?'}>
            <select
              className="h-8 w-full rounded-md border border-neutral-300 bg-white px-2 text-[13px]"
              value={actiehouder} onChange={e => setActiehouder(e.target.value)}
            >
              <option value="">Kies een collega…</option>
              {props.medewerkers.map(m => <option key={m.id} value={m.id}>{m.naam}</option>)}
            </select>
          </Label>

          {/* Een percentage, geen los getal: het voedt de kans-gewogen pijplijn onder
              Management → Verkoop (bedrag × kans). Vaste stappen van 5%, want de schijnprecisie
              van "37%" helpt niemand — en het scheelt tikwerk. */}
          <Label tekst="Kans op opdracht (optioneel)">
            <div className="flex items-center gap-2">
              <select
                className="h-8 w-32 rounded-md border border-neutral-300 bg-white px-2 text-[13px]"
                value={kans}
                onChange={e => setKans(e.target.value)}
              >
                <option value="">Onbekend</option>
                {KANS_STAPPEN.map(p => <option key={p} value={String(p)}>{p}%</option>)}
              </select>
              <span className="text-xs text-neutral-500">
                {kans === '' ? 'Laat op Onbekend als je het niet weet' : 'Telt mee in de gewogen pijplijn'}
              </span>
            </div>
          </Label>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>Annuleren</Button>
          <Button disabled={bezig} onClick={opslaan}>{bezig ? 'Bezig…' : 'Opslaan'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Label({ tekst, children }: { tekst: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-700">{tekst}</span>
      {children}
    </label>
  )
}
