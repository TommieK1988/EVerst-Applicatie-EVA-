'use client'

/**
 * De bewakingskaart: wat speelt er, wie is aan zet, en wat gebeurt er hierna.
 *
 * De kaart is bewust de énige plek waar de volgende stap wordt onderhouden. Daarom zitten er
 * precies twee knoppen op: "Uitkomst vastleggen" (na een klantcontact — het pad dat 95% van
 * de tijd gebruikt wordt) en "Aanpassen" (voor de losse velden). Meer keuzes maken het
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
import { useDialogen } from '@/components/ui/dialogen'
import { cn } from '@everts/ui'
import { formatDatumNL, datumNaarISO } from '@/lib/dossiers/datum-regels'
import {
  STATUS_PRESENTATIE, UITKOMSTEN, VERLIES_REDENEN, stapOmschrijving,
  type BewakingKaart, type BewakingStatus, type UitkomstDefinitie,
} from '@/lib/commercie/types'
import { legUitkomstVast, slaStapOp } from '@/lib/commercie/actions'

type Medewerker = { id: string; naam: string }

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
              <Button size="sm" variant="outline" onClick={() => setAanpassenOpen(true)}>Aanpassen</Button>
            </div>
          )}
        </CardHeader>

        <CardBody className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <Veld label="Offertebedrag" waarde={eur(props.bedrag)} />
          <Veld label="Klant" waarde={props.klant ?? '—'} />
          <Veld label="Commercieel eigenaar" waarde={props.eigenaarNaam ?? 'Nog niet bepaald'} />
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

// ── Uitkomst vastleggen ──────────────────────────────────────────────────────

function UitkomstDialoog(props: {
  open: boolean
  onOpenChange: (v: boolean) => void
  dossierId: string
  medewerkers: Medewerker[]
}) {
  const [gekozen, setGekozen] = React.useState<UitkomstDefinitie | null>(null)
  const [tekst, setTekst] = React.useState('')
  const [datum, setDatum] = React.useState<Date | undefined>()
  const [actiehouder, setActiehouder] = React.useState('')
  const [reden, setReden] = React.useState('')
  const [toelichting, setToelichting] = React.useState('')
  const [bezig, setBezig] = React.useState(false)
  const { bevestig: bevestigDialoog } = useDialogen()

  // Terug naar de keuzelijst zodra de dialoog sluit, zodat de volgende keer niet halverwege
  // een vorige uitkomst wordt hervat.
  React.useEffect(() => {
    if (props.open) return
    setGekozen(null); setTekst(''); setDatum(undefined)
    setActiehouder(''); setReden(''); setToelichting('')
  }, [props.open])

  async function bevestig(forceerBouw7 = false) {
    if (!gekozen) return
    setBezig(true)
    const res = await legUitkomstVast(props.dossierId, {
      uitkomst: gekozen.sleutel,
      tekst: tekst || null,
      stapDatum: datum ? datumNaarISO(datum) : null,
      actiehouderId: actiehouder || null,
      reden: reden || null,
      redenToelichting: toelichting || null,
      forceerBouw7,
    })
    setBezig(false)

    if (res.ok) {
      toast.success('Vastgelegd')
      props.onOpenChange(false)
      return
    }
    // Bouw7 en EVA zijn het oneens over de fase — iemand heeft hem daar inmiddels verzet.
    // De gebruiker beslist wie wint; stil overschrijven zou het werk van een collega wissen.
    if (res.conflict) {
      const tochDoorvoeren = await bevestigDialoog({
        titel: 'In Bouw7 staat iets anders',
        omschrijving:
          `Deze offerte staat in Bouw7 inmiddels op "${res.conflict.bouw7Label}". `
          + 'Wil je jouw wijziging tóch doorvoeren en die van Bouw7 overschrijven?',
        bevestigLabel: 'Tóch doorvoeren',
        annuleerLabel: 'Bouw7 volgen',
      })
      if (tochDoorvoeren) await bevestig(true)
      return
    }
    toast.error(res.error)
  }

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

        <DialogBody className="space-y-3">
          {!gekozen ? (
            <div className="grid gap-2">
              {UITKOMSTEN.map(u => (
                <button
                  key={u.sleutel}
                  type="button"
                  onClick={() => setGekozen(u)}
                  className="rounded-lg border border-neutral-200 px-3 py-2 text-left hover:border-brand-500 hover:bg-neutral-50"
                >
                  <div className="text-sm font-medium text-neutral-900">{u.label}</div>
                  <div className="text-xs text-neutral-500">{u.gevolg}</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg bg-neutral-50 px-3 py-2">
                <div className="text-sm font-medium text-neutral-900">{gekozen.label}</div>
                <div className="text-xs text-neutral-500">{gekozen.gevolg}</div>
                <button
                  type="button"
                  className="mt-1 text-xs text-brand-600 underline"
                  onClick={() => setGekozen(null)}
                >
                  Andere uitkomst kiezen
                </button>
              </div>

              <Label tekst="Wat is er gezegd of gebeurd? (optioneel)">
                <Input
                  value={tekst}
                  onChange={e => setTekst(e.target.value)}
                  placeholder="Kort en feitelijk, bv. 'Voorzitter gesproken, staat op agenda ALV'"
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
                    {props.medewerkers.map(m => (
                      <option key={m.id} value={m.id}>{m.naam}</option>
                    ))}
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
                    Verloren — dan blijft de kans bewaard.
                  </p>
                </>
              )}
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>Annuleren</Button>
          <Button disabled={!gekozen || bezig} onClick={() => bevestig()}>
            {bezig ? 'Bezig…' : 'Vastleggen'}
          </Button>
        </DialogFooter>
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
            <DialogTitle>Bewaking aanpassen</DialogTitle>
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

          <Label tekst="Kans op opdracht (optioneel)">
            <Input
              type="number" min={0} max={100} value={kans}
              onChange={e => setKans(e.target.value)}
              placeholder="Laat leeg als je het niet weet"
            />
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
