'use client'

import React, { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, Checkbox, EmptyState, FormField, FormRow, PageHeader,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Spinner, Textarea, useBevestig,
} from '@/components/ui'
import {
  getVerzamelKandidaten, getVerzamelVoorbeeld, maakVerzamelfactuur,
} from '@/lib/verzamelfactuur/actions'
import type { Factuurpartij, VerzamelVoorbeeld, VerzamelfactuurRij, Werkmaatschappij } from '@/lib/verzamelfactuur/types'
import type { BtwTariefKeuze } from '@/lib/stamdata/btw'
import { VerzamelVoorbeeldWeergave } from './VerzamelVoorbeeldWeergave'
import { RecenteVerzamelfacturen } from './RecenteVerzamelfacturen'
import { euro } from './format'
import { useBonBedragen, type BedragStand } from './useBonBedragen'

type Props = {
  werkmaatschappijen: Werkmaatschappij[]
  recent: VerzamelfactuurRij[]
  tarieven: BtwTariefKeuze[]
  magBewerken: boolean
}

type Voorbeeld = VerzamelVoorbeeld & { btwTariefBouw7Id: number }

/**
 * Nieuwe verzamelfactuur: werkmaatschappij → factuurpartij → bonnen aanvinken → voorbeeld →
 * klaarzetten in Bouw7. Regels pas je niet hier aan maar in de bon zelf; dit scherm toont wat
 * er uit de bonnen volgt en zet dat klaar.
 */
export default function VerzamelfactuurScherm({ werkmaatschappijen, recent, tarieven, magBewerken }: Props) {
  const bevestig = useBevestig()
  const [werkmaatschappijId, setWerkmaatschappijId] = useState<string>(
    werkmaatschappijen.length === 1 ? werkmaatschappijen[0].id : '')
  const [partijen, setPartijen] = useState<Factuurpartij[] | null>(null)
  const [partijId, setPartijId] = useState<string>('')
  const [gekozen, setGekozen] = useState<Set<string>>(new Set())
  const [omschrijving, setOmschrijving] = useState('')
  const [btwId, setBtwId] = useState<number | null>(null)
  const [voorbeeld, setVoorbeeld] = useState<Voorbeeld | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const [klaar, setKlaar] = useState<{ invoiceId: number; totaal: number; aantal: number; waarschuwingen: string[] } | null>(null)
  const [laden, startLaden] = useTransition()
  const [bezig, startBezig] = useTransition()

  const partij = useMemo(() => partijen?.find(p => p.bouw7ContactId === partijId) ?? null, [partijen, partijId])
  const bedragen = useBonBedragen(useMemo(() => (partij?.dossiers ?? []).map(d => d.id), [partij]))
  const somGekozen = (veld: 'geboekteKosten' | 'opFactuur'): number | null => {
    let som = 0
    for (const id of gekozen) {
      const b = bedragen.get(id)
      if (b === undefined) return null
      som += b?.[veld] ?? 0
    }
    return som
  }

  // Werkmaatschappij gekozen → factuurpartijen ophalen.
  useEffect(() => {
    setPartijen(null); setPartijId(''); setGekozen(new Set()); setVoorbeeld(null); setFout(null)
    if (!werkmaatschappijId) return
    startLaden(async () => {
      try {
        setPartijen(await getVerzamelKandidaten(werkmaatschappijId))
      } catch (e) {
        setFout(e instanceof Error ? e.message : 'De bonnen zijn niet op te halen.')
        setPartijen([])
      }
    })
  }, [werkmaatschappijId])

  // Elke wijziging in de selectie maakt een voorbeeld ongeldig: wat je ziet moet zijn wat er gaat.
  useEffect(() => { setVoorbeeld(null) }, [partijId, gekozen, btwId])

  function kiesPartij(id: string) {
    setPartijId(id)
    setBtwId(null)
    setKlaar(null)
    const p = partijen?.find(x => x.bouw7ContactId === id)
    setGekozen(new Set((p?.dossiers ?? []).filter(d => !d.opConcept).map(d => d.id)))
  }

  function wissel(id: string, aan: boolean) {
    setGekozen(prev => {
      const nieuw = new Set(prev)
      if (aan) nieuw.add(id); else nieuw.delete(id)
      return nieuw
    })
  }

  const selectie = () => ({
    werkmaatschappijId, bouw7ContactId: partijId, dossierIds: [...gekozen], btwTariefBouw7Id: btwId,
  })

  function maakVoorbeeld() {
    setFout(null)
    startLaden(async () => {
      const r = await getVerzamelVoorbeeld(selectie())
      if (!r.ok) { setFout(r.error); return }
      setVoorbeeld(r.voorbeeld)
      if (btwId == null) setBtwId(r.voorbeeld.btwTariefBouw7Id)
    })
  }

  async function klaarzetten() {
    if (!voorbeeld) return
    const ja = await bevestig({
      titel: 'Verzamelfactuur klaarzetten in Bouw7?',
      omschrijving: `${voorbeeld.dossiers.length} bon${voorbeeld.dossiers.length === 1 ? '' : 'nen'} voor `
        + `${voorbeeld.factuurpartij.naam}, samen ${euro(voorbeeld.totaalExcl)} excl. btw. `
        + 'De factuur krijgt nog geen factuurnummer; de administratie verstuurt hem in Bouw7. '
        + 'Zodra hij verstuurd is, gaan de bonnen naar Financieel gereed.',
      bevestigLabel: 'Klaarzetten',
    })
    if (!ja) return
    startBezig(async () => {
      const r = await maakVerzamelfactuur({ ...selectie(), btwTariefBouw7Id: voorbeeld.btwTariefBouw7Id, omschrijving })
      if (!r.ok) {
        setFout(r.error)
        toast.error('Klaarzetten is niet gelukt.')
        return
      }
      toast.success(`Verzamelfactuur klaargezet in Bouw7 — ${r.aantal} bonnen, ${euro(r.totaal)} excl. btw.`)
      setKlaar(r)
      setVoorbeeld(null)
      setOmschrijving('')
      // Opnieuw ophalen: de bonnen staan nu op een concept en zijn niet meer te kiezen.
      setPartijen(await getVerzamelKandidaten(werkmaatschappijId))
      setGekozen(new Set())
    })
  }

  const kiesbaar = partij?.dossiers.filter(d => !d.opConcept) ?? []
  const allesAan = kiesbaar.length > 0 && kiesbaar.every(d => gekozen.has(d.id))

  return (
    <div className="eva-page-full pb-7 pt-5">
      <PageHeader
        eyebrow="Financieel"
        title={['Facturen', 'Nieuwe verzamelfactuur']}
        actions={<Link href="/facturen"><Button variant="outline">Terug naar facturen</Button></Link>}
      />

      <div className="flex max-w-[1100px] flex-col gap-4">
        <Card>
          <CardHeader>Voor wie</CardHeader>
          <CardBody>
            <FormRow cols="2">
              <FormField label="Werkmaatschappij" upper>
                <Select value={werkmaatschappijId} onValueChange={setWerkmaatschappijId}>
                  <SelectTrigger><SelectValue placeholder="Kies een werkmaatschappij" /></SelectTrigger>
                  <SelectContent>
                    {werkmaatschappijen.map(w => <SelectItem key={w.id} value={w.id}>{w.naam}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField
                label="Factuurpartij"
                upper
                helper={partij?.viaFactuuradres ? 'Betaalt via het factuuradres op de bonnen.' : undefined}
              >
                <Select value={partijId} onValueChange={kiesPartij} disabled={!partijen || partijen.length === 0}>
                  <SelectTrigger>
                    <SelectValue placeholder={!werkmaatschappijId ? 'Kies eerst een werkmaatschappij' : laden && !partijen ? 'Laden…' : 'Kies een factuurpartij'} />
                  </SelectTrigger>
                  <SelectContent>
                    {(partijen ?? []).map(p => (
                      <SelectItem key={p.bouw7ContactId} value={p.bouw7ContactId}>
                        {p.naam} · {p.dossiers.length} bon{p.dossiers.length === 1 ? '' : 'nen'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </FormRow>
            {partijen && partijen.length === 0 && !fout && (
              <p className="mt-4 text-[13px] text-neutral-500">
                Bij deze werkmaatschappij staan geen servicedeskbonnen op Kosten compleet.
              </p>
            )}
          </CardBody>
        </Card>

        {partij && (
          <Card>
            <CardHeader>
              <span>Bonnen op Kosten compleet</span>
              <span className="text-[12px] font-medium">{gekozen.size} van {kiesbaar.length} gekozen</span>
            </CardHeader>
            <CardBody className="p-0">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-[10.5px] uppercase tracking-[0.08em] text-neutral-500">
                    <th className="w-10 px-4 py-2">
                      <Checkbox
                        checked={allesAan}
                        onCheckedChange={v => setGekozen(v === true ? new Set(kiesbaar.map(d => d.id)) : new Set())}
                        aria-label="Alles kiezen"
                      />
                    </th>
                    <th className="px-2 py-2">Bon</th>
                    <th className="px-2 py-2">Omschrijving</th>
                    <th className="px-2 py-2">Referentie</th>
                    {partij.viaFactuuradres && <th className="px-2 py-2">Opdrachtgever</th>}
                    <th className="whitespace-nowrap px-2 py-2 text-right">Geboekte kosten</th>
                    <th className="whitespace-nowrap px-2 py-2 text-right">Op de factuur</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {partij.dossiers.map(d => (
                    <tr key={d.id} className="border-b border-neutral-100 last:border-0">
                      <td className="px-4 py-2">
                        <Checkbox
                          checked={gekozen.has(d.id)}
                          disabled={!!d.opConcept}
                          onCheckedChange={v => wissel(d.id, v === true)}
                          aria-label={`Bon ${d.dossiernummer ?? ''} kiezen`}
                        />
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 font-semibold tabular-nums">
                        <Link href={`/servicedesk/${d.id}/verkoop`} className="text-brand-700 hover:underline" target="_blank">
                          {d.dossiernummer ?? '—'}
                        </Link>
                      </td>
                      <td className="px-2 py-2 text-neutral-700">{d.titel ?? '—'}</td>
                      <td className="px-2 py-2 text-neutral-500">{d.referentie ?? '—'}</td>
                      {partij.viaFactuuradres && <td className="px-2 py-2 text-neutral-500">{d.opdrachtgever ?? '—'}</td>}
                      <BedragCel stand={bedragen.get(d.id)} veld="geboekteKosten" />
                      <BedragCel stand={bedragen.get(d.id)} veld="opFactuur" />
                      <td className="px-4 py-2 text-right">
                        {d.opConcept && <Badge tone="warning">Staat al klaar in Bouw7</Badge>}
                        <AlGefactureerd stand={bedragen.get(d.id)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-neutral-200 font-semibold text-neutral-900">
                    <td />
                    <td colSpan={partij.viaFactuuradres ? 4 : 3} className="px-2 py-2">Gekozen bonnen</td>
                    <SomCel som={somGekozen('geboekteKosten')} />
                    <SomCel som={somGekozen('opFactuur')} />
                    <td />
                  </tr>
                </tfoot>
              </table>
            </CardBody>
          </Card>
        )}

        {partij && (
          <Card>
            <CardHeader>Factuur</CardHeader>
            <CardBody>
              <div className="flex flex-col gap-4">
                <FormField
                  label="Omschrijving"
                  upper
                  optional
                  helper="Staat bovenaan de factuur, bijvoorbeeld de periode, het projectnummer van de opdrachtgever of het complex."
                >
                  <Textarea
                    rows={4}
                    value={omschrijving}
                    onChange={e => setOmschrijving(e.target.value)}
                    placeholder={'Uitgevoerde werkzaamheden in de maand september 2026\nProject …\nComplex: …'}
                  />
                </FormField>
                <FormRow cols="2">
                  <FormField
                    label="Btw voor regels zonder eigen tarief"
                    upper
                    helper="Regels met een eigen btw-tarief in de bon houden dat tarief."
                  >
                    <Select
                      value={btwId != null ? String(btwId) : ''}
                      onValueChange={v => setBtwId(Number(v))}
                    >
                      <SelectTrigger><SelectValue placeholder="Standaard voor deze factuurpartij" /></SelectTrigger>
                      <SelectContent>
                        {tarieven.filter(t => t.bouw7_id != null).map(t => (
                          <SelectItem key={t.id} value={String(t.bouw7_id)}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                </FormRow>
                <div className="flex items-center gap-3">
                  <Button onClick={maakVoorbeeld} disabled={gekozen.size === 0 || laden || bezig} variant={voorbeeld ? 'outline' : 'primary'}>
                    {laden ? <Spinner size="sm" /> : null}
                    {voorbeeld ? 'Voorbeeld vernieuwen' : 'Voorbeeld maken'}
                  </Button>
                  {laden && <span className="text-[12px] text-neutral-500">De regels worden per bon opgehaald; dat kan even duren.</span>}
                </div>
              </div>
            </CardBody>
          </Card>
        )}

        {fout && <Alert tone="error" title="Dat lukte niet" onClose={() => setFout(null)}>{fout}</Alert>}

        {klaar && (
          <Alert tone="success" title={`Verzamelfactuur klaargezet in Bouw7 (factuur ${klaar.invoiceId})`} onClose={() => setKlaar(null)}>
            {klaar.aantal} bonnen, {euro(klaar.totaal)} excl. btw. De administratie kan hem in Bouw7 controleren en versturen;
            daarna gaan de bonnen vanzelf naar Financieel gereed.
            {klaar.waarschuwingen.length > 0 && (
              <ul className="mt-2 list-disc pl-5">
                {klaar.waarschuwingen.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </Alert>
        )}

        {voorbeeld && (
          <VerzamelVoorbeeldWeergave
            voorbeeld={voorbeeld}
            omschrijving={omschrijving}
            magBewerken={magBewerken}
            bezig={bezig}
            onKlaarzetten={klaarzetten}
          />
        )}

        {!partij && !werkmaatschappijId && werkmaatschappijen.length === 0 && (
          <EmptyState title="Geen werkmaatschappijen" description="Er is geen werkmaatschappij aan een Bouw7-vestiging gekoppeld." />
        )}

        <RecenteVerzamelfacturen rijen={recent} />
      </div>
    </div>
  )
}

/** Bedrag in de keuzelijst: een streepje tijdens het laden, "?" als het niet op te halen was. */
function BedragCel({ stand, veld }: { stand: BedragStand; veld: 'geboekteKosten' | 'opFactuur' }) {
  const waarde = stand?.[veld]
  return (
    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-neutral-700">
      {stand === undefined
        ? <span className="text-neutral-300">…</span>
        : waarde == null
          ? <span className="text-neutral-400" title="Niet op te halen uit Bouw7">?</span>
          : <span className={veld === 'opFactuur' && waarde === 0 ? 'text-neutral-400' : undefined}>{euro(waarde)}</span>}
    </td>
  )
}

function SomCel({ som }: { som: number | null }) {
  return (
    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
      {som == null ? <span className="font-normal text-neutral-300">…</span> : euro(som)}
    </td>
  )
}

/** Staat er in Bouw7 al een factuur op deze bon? Dan wil je dat zien vóór je hem aanvinkt. */
function AlGefactureerd({ stand }: { stand: BedragStand }) {
  const facturen = stand?.bouw7Facturen ?? []
  if (facturen.length === 0) return null
  const titel = facturen.map(f => `${f.nummer ?? 'concept'}: ${euro(f.bedrag)}`).join(', ')
  return (
    <Badge tone="info" title={titel} className="whitespace-nowrap">
      {facturen.length === 1 ? `Al factuur ${facturen[0].nummer ?? '(concept)'}` : `${facturen.length} facturen in Bouw7`}
    </Badge>
  )
}
