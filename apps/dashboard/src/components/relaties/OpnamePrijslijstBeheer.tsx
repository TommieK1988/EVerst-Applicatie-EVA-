'use client'

/**
 * Beheer van de opnameprijslijsten van één opdrachtgever.
 *
 * Waarom hier en niet in de calculatiebibliotheek: dit is een AFSPRAAK met deze opdrachtgever, geen
 * bedrijfsbrede stamdata. Hij staat daarom naast de verkoop-prijsafspraken op dezelfde pagina.
 *
 * Werkwijze in de praktijk: corporatie stuurt jaarlijks een nieuwe prijslijst → kopieer de vorige
 * jaargang → importeer het nieuwe Excel eroverheen → activeer → zet de oude op vervallen. Lopende
 * opnames houden hun eigen bevroren snapshot en veranderen daar niet van.
 */

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { useDialogen } from '@/components/ui/dialogen'
import {
  getOnderdelen,
  getPrijslijsten,
  getRuimtes,
  kopieerPrijslijst,
  slaOnderdeelOp,
  slaPrijslijstOp,
  slaRuimteOp,
  verwijderOnderdeel,
  verwijderRuimte,
  zetPrijslijstStatus,
} from '@/lib/opname/bibliotheek'
import { leesOpnamePrijslijstExcel, pasOpnamePrijslijstImportToe, type ImportVoorbeeld } from '@/lib/opname/import-excel'
import {
  OPNAME_PRIJSLIJST_STATUS_LABELS,
  type OpnameOnderdeel,
  type OpnamePrijslijst,
  type OpnameRuimte,
} from '@everts/database/opname-types'
import { formatEuro } from '@/lib/everts-calc/calculations'

const STATUS_KLEUR: Record<string, string> = {
  concept: 'bg-amber-50 text-amber-700 border-amber-200',
  actief: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  vervallen: 'bg-neutral-100 text-neutral-500 border-neutral-200',
}

export default function OpnamePrijslijstBeheer({ relatieId }: { relatieId: string }) {
  const { bevestig, vraagTekst } = useDialogen()
  const [lijsten, setLijsten] = useState<OpnamePrijslijst[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)

  const laden = useCallback(async () => {
    try {
      setLijsten(await getPrijslijsten(relatieId))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Prijslijsten laden mislukt')
      setLijsten([])
    }
  }, [relatieId])

  useEffect(() => {
    void laden()
  }, [laden])

  async function nieuweLijst() {
    const naam = await vraagTekst({
      titel: 'Nieuwe opnameprijslijst',
      omschrijving: 'Bijvoorbeeld: Mutatieonderhoud 2026',
      verplicht: true,
    })
    if (!naam) return
    setBezig(true)
    try {
      await slaPrijslijstOp({
        relatie_id: relatieId,
        naam,
        jaargang: String(new Date().getFullYear()),
        status: 'concept',
        standaard_opslag_pct: 0,
      } as never)
      await laden()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Aanmaken mislukt')
    } finally {
      setBezig(false)
    }
  }

  async function kopieer(lijst: OpnamePrijslijst) {
    const jaargang = await vraagTekst({
      titel: 'Kopiëren naar nieuwe jaargang',
      omschrijving: 'De kopie start als concept, met alle onderdelen en ruimtes van deze lijst.',
      standaard: String(new Date().getFullYear() + 1),
      verplicht: true,
    })
    if (!jaargang) return
    setBezig(true)
    const res = await kopieerPrijslijst(lijst.id, jaargang)
    setBezig(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success('Kopie aangemaakt')
    await laden()
    setOpen(res.id)
  }

  async function statusZetten(lijst: OpnamePrijslijst, status: 'actief' | 'vervallen') {
    if (status === 'actief') {
      const ja = await bevestig({
        titel: 'Prijslijst activeren?',
        omschrijving:
          'Nieuwe opnames voor deze opdrachtgever gaan hierna deze lijst gebruiken. ' +
          'Zet de vorige jaargang daarna op vervallen.',
        bevestigLabel: 'Activeren',
      })
      if (!ja) return
    }
    try {
      await zetPrijslijstStatus(lijst.id, status)
      await laden()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bijwerken mislukt')
    }
  }

  if (lijsten === null) {
    return (
      <Card>
        <CardHeader>Opnameprijslijsten</CardHeader>
        <CardBody>
          <span className="text-[13px] text-neutral-500">Laden…</span>
        </CardBody>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <span>Opnameprijslijsten{lijsten.length > 0 ? ` · ${lijsten.length}` : ''}</span>
        <button
          type="button"
          onClick={nieuweLijst}
          disabled={bezig}
          className="text-[12px] font-semibold text-[var(--brand-700,#00752e)] hover:underline disabled:opacity-50"
        >
          + Nieuwe lijst
        </button>
      </CardHeader>
      <CardBody className="space-y-3">
        <p className="text-[12.5px] text-neutral-500">
          De onderdelen die de opnemer op zijn telefoon kan kiezen bij mutatiewerk voor deze
          opdrachtgever.
        </p>

        {lijsten.length === 0 ? (
          <EmptyState
            size="sm"
            tone="neutral"
            title="Nog geen prijslijst"
            description="Maak er een aan en importeer de lijst die de opdrachtgever aanlevert."
          />
        ) : (
          lijsten.map(lijst => (
            <div key={lijst.id} className="rounded-lg border border-neutral-200">
              <button
                type="button"
                onClick={() => setOpen(open === lijst.id ? null : lijst.id)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-neutral-900">{lijst.naam}</span>
                  <span className="block text-[11.5px] text-neutral-500">
                    {[lijst.jaargang, lijst.geldig_vanaf && `vanaf ${lijst.geldig_vanaf}`]
                      .filter(Boolean)
                      .join(' · ') || 'geen jaargang'}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                    STATUS_KLEUR[lijst.status]
                  }`}
                >
                  {OPNAME_PRIJSLIJST_STATUS_LABELS[lijst.status]}
                </span>
              </button>

              {open === lijst.id && (
                <div className="space-y-4 border-t border-neutral-200 px-3 py-3">
                  <PrijslijstInstellingen lijst={lijst} onOpgeslagen={laden} />

                  <div className="flex flex-wrap gap-2">
                    {lijst.status !== 'actief' && (
                      <button
                        type="button"
                        onClick={() => statusZetten(lijst, 'actief')}
                        className="rounded-md border border-neutral-300 px-2.5 py-1 text-[12px] font-medium hover:bg-neutral-50"
                      >
                        Activeren
                      </button>
                    )}
                    {lijst.status === 'actief' && (
                      <button
                        type="button"
                        onClick={() => statusZetten(lijst, 'vervallen')}
                        className="rounded-md border border-neutral-300 px-2.5 py-1 text-[12px] font-medium hover:bg-neutral-50"
                      >
                        Vervallen verklaren
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => kopieer(lijst)}
                      className="rounded-md border border-neutral-300 px-2.5 py-1 text-[12px] font-medium hover:bg-neutral-50"
                    >
                      Kopiëren naar nieuwe jaargang
                    </button>
                  </div>

                  <ExcelImport prijslijstId={lijst.id} />
                  <RuimteBeheer prijslijstId={lijst.id} />
                  <OnderdelenTabel prijslijstId={lijst.id} />
                </div>
              )}
            </div>
          ))
        )}
      </CardBody>
    </Card>
  )
}

/* ───────────────────────────── Instellingen ──────────────────────────────── */

function PrijslijstInstellingen({
  lijst,
  onOpgeslagen,
}: {
  lijst: OpnamePrijslijst
  onOpgeslagen: () => Promise<void>
}) {
  const [opslag, setOpslag] = useState(String(lijst.standaard_opslag_pct ?? 0))
  const [uurtarief, setUurtarief] = useState(
    lijst.uurtarief_kostprijs != null ? String(lijst.uurtarief_kostprijs) : '',
  )
  const [bezig, setBezig] = useState(false)

  async function opslaan() {
    setBezig(true)
    try {
      await slaPrijslijstOp({
        id: lijst.id,
        relatie_id: lijst.relatie_id,
        naam: lijst.naam,
        standaard_opslag_pct: Number(opslag.replace(',', '.')) || 0,
        uurtarief_kostprijs: uurtarief ? Number(uurtarief.replace(',', '.')) : null,
      } as never)
      await onOpgeslagen()
      toast.success('Opgeslagen')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Opslaan mislukt')
    } finally {
      setBezig(false)
    }
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
          Standaardopslag %
        </span>
        <input
          value={opslag}
          onChange={e => setOpslag(e.target.value)}
          onBlur={opslaan}
          disabled={bezig}
          className="w-full rounded-md border border-neutral-300 px-2 py-1 text-[13px]"
        />
        <span className="mt-1 block text-[11px] text-neutral-500">
          Leidt de kostprijs af bij vaste prijzen zonder kostprijs of recept. 0 = kostprijs is
          gelijk aan de verkoopprijs, dus geen marge.
        </span>
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
          Uurtarief kostprijs
        </span>
        <input
          value={uurtarief}
          onChange={e => setUurtarief(e.target.value)}
          onBlur={opslaan}
          disabled={bezig}
          placeholder="bijv. 48"
          className="w-full rounded-md border border-neutral-300 px-2 py-1 text-[13px]"
        />
        <span className="mt-1 block text-[11px] text-neutral-500">
          Zet de uren van een vaste-prijs-onderdeel als echte arbeid in de calculatie, zodat
          werkbegroting en planning kloppende uren krijgen.
        </span>
      </label>
    </div>
  )
}

/* ─────────────────────────────── Excel ───────────────────────────────────── */

function ExcelImport({ prijslijstId }: { prijslijstId: string }) {
  const [voorbeeld, setVoorbeeld] = useState<ImportVoorbeeld | null>(null)
  const [bezig, setBezig] = useState(false)

  async function kies(bestand: File | undefined) {
    if (!bestand) return
    setBezig(true)
    try {
      const fd = new FormData()
      fd.append('bestand', bestand)
      setVoorbeeld(await leesOpnamePrijslijstExcel(prijslijstId, fd))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Inlezen mislukt')
    } finally {
      setBezig(false)
    }
  }

  async function bevestigImport() {
    if (!voorbeeld) return
    setBezig(true)
    const res = await pasOpnamePrijslijstImportToe(prijslijstId, voorbeeld.rijen)
    setBezig(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(`${res.aantal} onderdelen geïmporteerd`)
    setVoorbeeld(null)
  }

  return (
    <div className="rounded-lg border border-neutral-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12.5px] font-semibold text-neutral-800">Importeren uit Excel</span>
        <a
          href="/everts-calc/api/opname/sjabloon"
          className="text-[12px] font-medium text-[var(--brand-700,#00752e)] hover:underline"
        >
          Sjabloon downloaden
        </a>
      </div>

      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        disabled={bezig}
        onChange={e => {
          void kies(e.target.files?.[0])
          e.target.value = ''
        }}
        className="text-[12.5px]"
      />

      {voorbeeld && (
        <div className="mt-3 space-y-2 rounded-md bg-neutral-50 p-3 text-[12.5px]">
          <div>
            <strong>{voorbeeld.aangemaakt}</strong> nieuw · <strong>{voorbeeld.bijgewerkt}</strong> bijgewerkt
            {voorbeeld.fouten.length > 0 && (
              <> · <strong className="text-red-700">{voorbeeld.fouten.length} fout(en)</strong></>
            )}
          </div>
          {voorbeeld.fouten.length > 0 && (
            <ul className="max-h-40 list-disc overflow-y-auto pl-5 text-[12px] text-red-700">
              {voorbeeld.fouten.slice(0, 50).map((f, i) => (
                <li key={i}>{f}</li>
              ))}
              {voorbeeld.fouten.length > 50 && <li>…en nog {voorbeeld.fouten.length - 50}</li>}
            </ul>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={bevestigImport}
              disabled={bezig || voorbeeld.rijen.length === 0}
              className="rounded-md bg-[var(--brand-600,#009439)] px-2.5 py-1 text-[12px] font-semibold text-white disabled:opacity-50"
            >
              {voorbeeld.rijen.length} regels importeren
            </button>
            <button
              type="button"
              onClick={() => setVoorbeeld(null)}
              className="rounded-md border border-neutral-300 px-2.5 py-1 text-[12px] font-medium"
            >
              Annuleren
            </button>
          </div>
          {voorbeeld.fouten.length > 0 && (
            <p className="text-[11.5px] text-neutral-500">
              Regels met een fout worden niet geïmporteerd; de rest wel. Herstel ze in het Excel en
              lees het bestand opnieuw in.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────── Ruimtes ─────────────────────────────────── */

function RuimteBeheer({ prijslijstId }: { prijslijstId: string }) {
  const [ruimtes, setRuimtes] = useState<OpnameRuimte[]>([])
  const [nieuw, setNieuw] = useState('')

  const laden = useCallback(async () => {
    try {
      setRuimtes(await getRuimtes(prijslijstId))
    } catch {
      setRuimtes([])
    }
  }, [prijslijstId])

  useEffect(() => {
    void laden()
  }, [laden])

  async function toevoegen() {
    const naam = nieuw.trim()
    if (!naam) return
    try {
      await slaRuimteOp({ prijslijst_id: prijslijstId, naam, volgorde: ruimtes.length + 1 })
      setNieuw('')
      await laden()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Toevoegen mislukt')
    }
  }

  return (
    <div className="rounded-lg border border-neutral-200 p-3">
      <div className="mb-2 text-[12.5px] font-semibold text-neutral-800">
        Ruimtes · {ruimtes.length}
      </div>
      <p className="mb-2 text-[11.5px] text-neutral-500">
        Voorgestelde ruimtes op de telefoon. De opnemer mag altijd een eigen naam typen.
      </p>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {ruimtes.map(r => (
          <span
            key={r.id}
            className="inline-flex items-center gap-1 rounded-full border border-neutral-300 px-2 py-0.5 text-[12px]"
          >
            {r.naam}
            <button
              type="button"
              onClick={async () => {
                await verwijderRuimte(r.id)
                await laden()
              }}
              className="text-neutral-400 hover:text-red-600"
              aria-label={`${r.naam} verwijderen`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={nieuw}
          onChange={e => setNieuw(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void toevoegen()
            }
          }}
          placeholder="Bijv. Badkamer"
          className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-[13px]"
        />
        <button
          type="button"
          onClick={toevoegen}
          className="rounded-md border border-neutral-300 px-2.5 py-1 text-[12px] font-medium hover:bg-neutral-50"
        >
          Toevoegen
        </button>
      </div>
    </div>
  )
}

/* ───────────────────────────── Onderdelen ────────────────────────────────── */

function OnderdelenTabel({ prijslijstId }: { prijslijstId: string }) {
  const { bevestig } = useDialogen()
  const [onderdelen, setOnderdelen] = useState<OpnameOnderdeel[] | null>(null)
  const [zoek, setZoek] = useState('')
  const [uitgeklapt, setUitgeklapt] = useState(false)

  const laden = useCallback(async () => {
    try {
      setOnderdelen(await getOnderdelen(prijslijstId, false))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Onderdelen laden mislukt')
      setOnderdelen([])
    }
  }, [prijslijstId])

  useEffect(() => {
    void laden()
  }, [laden])

  if (onderdelen === null) {
    return <div className="text-[12.5px] text-neutral-500">Onderdelen laden…</div>
  }

  const term = zoek.trim().toLowerCase()
  const gefilterd = term
    ? onderdelen.filter(o =>
        `${o.code} ${o.omschrijving} ${o.hoofdgroep ?? ''}`.toLowerCase().includes(term),
      )
    : onderdelen
  const getoond = uitgeklapt ? gefilterd : gefilterd.slice(0, 25)

  async function deactiveer(o: OpnameOnderdeel) {
    const ja = await bevestig({
      titel: `${o.code} uit de lijst halen?`,
      omschrijving:
        'Het onderdeel verdwijnt uit de kiezer op de telefoon. Bestaande opnameregels blijven ' +
        'leesbaar: die dragen hun eigen bevroren prijs.',
      bevestigLabel: 'Uit de lijst halen',
    })
    if (!ja) return
    await verwijderOnderdeel(o.id)
    await laden()
  }

  async function wijzigPrijs(o: OpnameOnderdeel, waarde: string) {
    const nieuw = Number(waarde.replace(',', '.'))
    if (!Number.isFinite(nieuw) || nieuw === o.verkoop_pe) return
    try {
      await slaOnderdeelOp({ id: o.id, prijslijst_id: prijslijstId, code: o.code, verkoop_pe: nieuw })
      await laden()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Opslaan mislukt')
    }
  }

  return (
    <div className="rounded-lg border border-neutral-200 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[12.5px] font-semibold text-neutral-800">
          Onderdelen · {onderdelen.length}
        </span>
        <input
          value={zoek}
          onChange={e => setZoek(e.target.value)}
          placeholder="Zoeken"
          className="w-40 rounded-md border border-neutral-300 px-2 py-1 text-[12.5px]"
        />
      </div>

      {gefilterd.length === 0 ? (
        <p className="text-[12.5px] text-neutral-500">
          {onderdelen.length === 0
            ? 'Nog geen onderdelen. Importeer de prijslijst uit Excel.'
            : 'Niets gevonden.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-neutral-400">
                <th className="w-20 py-1 font-semibold">Code</th>
                <th className="py-1 font-semibold">Omschrijving</th>
                <th className="w-24 py-1 font-semibold">Groep</th>
                <th className="w-14 py-1 font-semibold">Eenh.</th>
                <th className="w-24 py-1 text-right font-semibold">Prijs</th>
                <th className="w-16 py-1 font-semibold">Soort</th>
                <th className="w-8 py-1" />
              </tr>
            </thead>
            <tbody>
              {getoond.map(o => (
                <tr
                  key={o.id}
                  className={`border-b border-neutral-100 ${o.actief ? '' : 'opacity-45'}`}
                >
                  <td className="py-1 text-neutral-500">{o.code}</td>
                  <td className="py-1 text-neutral-800">{o.omschrijving}</td>
                  <td className="py-1 text-neutral-500">{o.hoofdgroep ?? '—'}</td>
                  <td className="py-1 text-neutral-500">{o.eenheid}</td>
                  <td className="py-1 text-right">
                    {o.prijs_soort === 'vast' ? (
                      <input
                        defaultValue={o.verkoop_pe != null ? String(o.verkoop_pe) : ''}
                        onBlur={e => wijzigPrijs(o, e.target.value)}
                        className="w-20 rounded border border-transparent px-1 py-0.5 text-right tabular-nums hover:border-neutral-300 focus:border-neutral-400"
                      />
                    ) : (
                      <span className="tabular-nums text-neutral-500">
                        {o.verkoop_pe != null ? formatEuro(o.verkoop_pe) : 'recept'}
                      </span>
                    )}
                  </td>
                  <td className="py-1 text-neutral-500">{o.prijs_soort === 'vast' ? 'Vast' : 'Recept'}</td>
                  <td className="py-1 text-right">
                    {o.actief && (
                      <button
                        type="button"
                        onClick={() => deactiveer(o)}
                        title="Uit de lijst halen"
                        className="text-neutral-400 hover:text-red-600"
                      >
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {gefilterd.length > getoond.length && (
            <button
              type="button"
              onClick={() => setUitgeklapt(true)}
              className="mt-2 text-[12px] font-medium text-[var(--brand-700,#00752e)] hover:underline"
            >
              Alle {gefilterd.length} tonen
            </button>
          )}
        </div>
      )}
    </div>
  )
}
