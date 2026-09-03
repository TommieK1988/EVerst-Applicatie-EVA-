'use client'

import { useCallback, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { GebruikerLayout } from '@everts/database'
import OverzichtTabel, { type KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import { LegeStaat } from '@/components/dossiers/tabs/tab-ui'
import { NAAR_NIEUW_TABBLAD } from '@/components/dossiers/open-dossier'
import type { UrenOverzichtData, UrenOverzichtRegel } from '@/lib/uren/actions'
import { UREN_PERIODES, type UrenPeriode } from '@/lib/uren/types'
import { keurUrenGoed } from '@/lib/uren/bouw7-goedkeuring'
import toast from 'react-hot-toast'
import { useDialogen } from '@/components/ui/dialogen'

/* ─── Opmaak ────────────────────────────────────────────────────────────────── */

const euro = (n: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
const uur = (n: number) =>
  `${new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 }).format(n)} u`
const datum = (d: string | null) => (d ? new Date(d).toLocaleDateString('nl-NL') : '—')

function isoWeek(d: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  const utc = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()))
  utc.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7))
  const start = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1))
  return `W${Math.ceil((((utc.getTime() - start.getTime()) / 86400000) + 1) / 7)}`
}

const dossierLabel = (r: UrenOverzichtRegel) =>
  [r.dossierNummer, r.dossierTitel].filter(Boolean).join(' · ') || '—'

/* ─── Groeperen ─────────────────────────────────────────────────────────────── */

type GroepKey = 'geen' | 'medewerker' | 'dossier' | 'uursoort' | 'week' | 'dienstverband' | 'geaccordeerd' | 'projectleider'

const GROEPEN: { key: GroepKey; label: string; sleutel: (r: UrenOverzichtRegel) => string }[] = [
  { key: 'geen',          label: 'Niet groeperen',   sleutel: () => '' },
  { key: 'medewerker',    label: 'Medewerker',       sleutel: (r) => r.medewerker ?? '— onbekend —' },
  { key: 'dossier',       label: 'Dossier',          sleutel: (r) => dossierLabel(r) },
  { key: 'uursoort',      label: 'Uursoort',         sleutel: (r) => r.uursoort ?? '— geen —' },
  { key: 'week',          label: 'Week',             sleutel: (r) => isoWeek(r.datum) },
  { key: 'dienstverband', label: 'Intern / extern',  sleutel: (r) => (r.extern ? 'Extern' : 'Intern') },
  { key: 'geaccordeerd',  label: 'Geaccordeerd',     sleutel: (r) => (r.geaccordeerd ? 'Geaccordeerd' : 'Nog niet geaccordeerd') },
  { key: 'projectleider', label: 'Projectleider',    sleutel: (r) => r.projectleider ?? '— geen —' },
]

/** Groepsbalk: naam van de groep met het subtotaal erachter. */
function GroepKop({ rijen, sleutel }: { rijen: UrenOverzichtRegel[]; sleutel: string }) {
  const urenTotaal = rijen.reduce((s, r) => s + r.uren, 0)
  const bedragTotaal = rijen.reduce((s, r) => s + r.bedrag, 0)
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
      <span style={{ fontWeight: 700, color: 'var(--fg)' }}>{sleutel || '—'}</span>
      <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{rijen.length} regels</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>
        {uur(urenTotaal)}
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>
        {euro(bedragTotaal)}
      </span>
    </div>
  )
}

/* ─── Kolommen ──────────────────────────────────────────────────────────────── */

const tekst = (v: string | null, zacht = false) => (
  <span style={{ fontSize: 13, color: zacht ? 'var(--fg-soft)' : 'var(--fg)' }}>{v ?? '—'}</span>
)
const getal = (v: string, kleur?: string) => (
  <span style={{ fontSize: 13, fontWeight: 600, color: kleur ?? 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
)

/**
 * Het select-filter vergelijkt op de waarde uit `sorteerWaarde` (zie `inLijstFilter` in
 * OverzichtTabel), dus `filterOpties` moet exact díé waarden bevatten. Voor Uursoort komen
 * ze daarom uit de opgehaalde regels en niet uit een vaste lijst.
 */
function maakKolommen(uursoortOpties: string[]): KolomDefinitie<UrenOverzichtRegel>[] {
  return [
  {
    key: 'medewerker', label: 'Medewerker', vast: true, breedte: 170, filterType: 'tekst',
    sorteerWaarde: (r) => r.medewerker ?? '',
    render: (r) => <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{r.medewerker ?? '—'}</span>,
  },
  {
    key: 'dossier', label: 'Dossier', breedte: 260, filterType: 'tekst',
    sorteerWaarde: (r) => dossierLabel(r),
    render: (r) => (r.dossierHref
      ? <Link href={r.dossierHref} {...NAAR_NIEUW_TABBLAD} style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none' }}>{dossierLabel(r)}</Link>
      : tekst(dossierLabel(r))),
  },
  {
    key: 'datum', label: 'Datum', breedte: 100,
    sorteerWaarde: (r) => r.datum ?? '',
    render: (r) => <span style={{ fontSize: 12.5, color: 'var(--fg-soft)', fontVariantNumeric: 'tabular-nums' }}>{datum(r.datum)}</span>,
  },
  {
    key: 'week', label: 'Week', breedte: 70, filterType: 'tekst',
    sorteerWaarde: (r) => r.datum ?? '',
    render: (r) => tekst(isoWeek(r.datum), true),
  },
  {
    key: 'uursoort', label: 'Uursoort', breedte: 175, filterType: 'select',
    filterOpties: uursoortOpties,
    sorteerWaarde: (r) => r.uursoort ?? '',
    render: (r) => tekst(r.uursoort, true),
  },
  {
    key: 'code', label: 'Bewakingscode', breedte: 175, filterType: 'tekst',
    sorteerWaarde: (r) => r.code ?? '',
    render: (r) => tekst(r.code ? `${r.code}${r.codeNaam ? ` · ${r.codeNaam}` : ''}` : null, true),
  },
  {
    key: 'geaccordeerd', label: 'Geaccordeerd', breedte: 115, filterType: 'select',
    filterOpties: ['Ja', 'Nee'],
    sorteerWaarde: (r) => (r.geaccordeerd ? 'Ja' : 'Nee'),
    render: (r) => (
      <span style={{ fontSize: 12.5, fontWeight: 700, color: r.geaccordeerd ? '#009439' : '#d9534f' }}>
        {r.geaccordeerd ? 'Ja' : 'Nee'}
      </span>
    ),
  },
  {
    key: 'dienstverband', label: 'Dienstverband', breedte: 120, filterType: 'select',
    filterOpties: ['Intern', 'Extern'],
    sorteerWaarde: (r) => (r.extern ? 'Extern' : 'Intern'),
    render: (r) => tekst(r.extern ? 'Extern' : 'Intern', true),
  },
  {
    key: 'projectleider', label: 'Projectleider', breedte: 150, filterType: 'tekst',
    sorteerWaarde: (r) => r.projectleider ?? '',
    render: (r) => tekst(r.projectleider, true),
  },
  {
    key: 'uren', label: 'Uren', breedte: 85,
    sorteerWaarde: (r) => r.uren,
    render: (r) => getal(uur(r.uren)),
  },
  {
    key: 'uurtarief', label: 'Uurtarief', breedte: 100,
    sorteerWaarde: (r) => r.uurtarief ?? 0,
    render: (r) => (r.uurtarief ? getal(euro(r.uurtarief), 'var(--fg-soft)') : tekst(null, true)),
  },
  {
    key: 'bedrag', label: 'Bedrag', breedte: 110,
    sorteerWaarde: (r) => r.bedrag,
    render: (r) => getal(euro(r.bedrag), 'var(--accent)'),
  },
  // Detailkolommen — standaard uit, aan te zetten via kolombeheer en te bewaren in een layout.
  {
    key: 'geaccordeerdDoor', label: 'Geacc. door', breedte: 165, filterType: 'tekst',
    standaard_zichtbaar: false,
    sorteerWaarde: (r) => r.geaccordeerdDoor ?? '',
    render: (r) => tekst(r.geaccordeerdDoor, true),
  },
  {
    key: 'geaccordeerdOp', label: 'Geacc. op', breedte: 105,
    standaard_zichtbaar: false,
    sorteerWaarde: (r) => r.geaccordeerdOp ?? '',
    render: (r) => tekst(datum(r.geaccordeerdOp), true),
  },
  {
    key: 'opmerking', label: 'Opmerking', breedte: 240, filterType: 'tekst',
    standaard_zichtbaar: false,
    sorteerWaarde: (r) => r.opmerking ?? '',
    render: (r) => tekst(r.opmerking, true),
  },
  {
    key: 'projectnummer', label: 'Bouw7-projectnr.', breedte: 130, filterType: 'tekst',
    standaard_zichtbaar: false,
    sorteerWaarde: (r) => r.projectNummer ?? '',
    render: (r) => tekst(r.projectNummer, true),
  },
  ]
}

/* ─── Scherm ────────────────────────────────────────────────────────────────── */

export default function UrenOverzicht({
  data, periode, layouts, user_id, magAlles, medewerkerId,
}: {
  data: UrenOverzichtData
  periode: UrenPeriode
  layouts: GebruikerLayout[]
  user_id: string | null
  /** Met financieel-recht zie je alles; zonder alleen je eigen goed te keuren uren. */
  magAlles: boolean
  medewerkerId: string
}) {
  const router = useRouter()
  const [bezig, start] = useTransition()
  const [groep, setGroep] = useState<GroepKey>('geen')

  // Uren die op mijn akkoord wachten: ik ben teamleider of projectleider op het dossier waarop ze
  // staan, en ze zijn nog niet goedgekeurd. Zonder financieel-recht is dat sowieso alles wat je
  // krijgt, dus staat de knop dan meteen aan.
  const magIkKeuren = useCallback(
    (r: UrenOverzichtRegel) =>
      !r.geaccordeerd && (r.teamleiderId === medewerkerId || r.projectleiderId === medewerkerId),
    [medewerkerId],
  )
  const teKeuren = useMemo(() => data.regels.filter(magIkKeuren), [data.regels, magIkKeuren])
  const [alleenMijn, setAlleenMijn] = useState(!magAlles)
  const [keurBezig, setKeurBezig] = useState(false)
  const [keurId, setKeurId] = useState<string | null>(null)

  // De tabel meldt terug welke rijen door de zoekbalk en de kolomfilters komen, zodat
  // de kaarten bovenin hetzelfde tellen als wat je op je scherm ziet staan.
  const [zichtbaar, setZichtbaar] = useState<UrenOverzichtRegel[] | null>(null)
  const meldTotalen = useCallback((rijen: UrenOverzichtRegel[]) => setZichtbaar(rijen), [])

  const { bevestig } = useDialogen()

  /**
   * Keurt uren goed in de rol die je op het betreffende dossier hebt — de server bepaalt dat, niet
   * dit scherm. Wat er in Bouw7 gebeurt hangt daarvan af: als projectleider gaat de vlag meteen om,
   * als teamleider pas wanneer er geen projectleider is. Dat verschil melden we terug, anders denkt
   * iemand dat het klaar is terwijl er nog iemand moet kijken.
   */
  const keur = useCallback(async (ids: number[]) => {
    if (!ids.length) return
    setKeurBezig(true)
    const r = await keurUrenGoed(ids)
    setKeurBezig(false)
    setKeurId(null)
    if (!r.ok) { toast.error(r.error); return }
    toast.success(
      r.naarBouw7 > 0 && r.wachtOpProjectleider > 0
        ? `${r.naarBouw7} goedgekeurd, ${r.wachtOpProjectleider} wacht nog op de projectleider.`
      : r.naarBouw7 > 0 ? `${r.naarBouw7} uurregel${r.naarBouw7 === 1 ? '' : 's'} goedgekeurd.`
      : `${r.verwerkt} akkoord — wacht nu op de projectleider.`,
    )
    if (r.mislukt > 0) toast.error(`${r.mislukt} niet gelukt: ${r.fouten[0] ?? ''}`)
    start(() => router.refresh())
  }, [router])

  const kolommen = useMemo(
    () => maakKolommen(
      [...new Set(data.regels.map((r) => r.uursoort).filter((u): u is string => !!u))]
        .sort((a, b) => a.localeCompare(b, 'nl')),
    ),
    [data.regels],
  )

  const telling = useMemo(() => {
    const rijen = zichtbaar ?? data.regels
    return {
      regels: rijen.length,
      uren: rijen.reduce((s, r) => s + r.uren, 0),
      bedrag: rijen.reduce((s, r) => s + r.bedrag, 0),
      nietGeaccordeerd: rijen.filter((r) => !r.geaccordeerd).length,
      gefilterd: rijen.length !== data.regels.length,
    }
  }, [zichtbaar, data.regels])

  // Stabiele referentie per groepeerkeuze: een objectliteral in de prop geeft TanStack
  // elke render een nieuwe referentie, waarna het grouped row model herbouwt en de
  // pagina in een update-lus vastloopt.
  const groepering = useMemo(() => {
    const gekozen = GROEPEN.find((g) => g.key === groep)
    if (!gekozen || gekozen.key === 'geen') return undefined
    return {
      sleutel: gekozen.sleutel,
      kop: (rijen: UrenOverzichtRegel[], sleutel: string) => <GroepKop rijen={rijen} sleutel={sleutel} />,
      standaardOpen: false,
    }
  }, [groep])

  function kiesPeriode(p: UrenPeriode) {
    start(() => router.push(`/uren?periode=${p}`))
  }

  return (
    <div className="eva-page-full" style={{ paddingTop: 18, paddingBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-muted)' }}>Financieel</div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, color: 'var(--fg)', letterSpacing: '-0.01em' }}>Uren</h1>
        </div>

        {/* Periode — via de URL, zodat je een periode kunt bewaren en doorsturen */}
        <div style={{ display: 'flex', gap: 2, padding: 3, background: 'var(--bg-subtle)', borderRadius: 9, width: 'fit-content' }}>
          {UREN_PERIODES.map((p) => (
            <button
              key={p.key}
              onClick={() => kiesPeriode(p.key)}
              disabled={bezig}
              style={{
                padding: '5px 12px', border: 'none', borderRadius: 7,
                cursor: bezig ? 'progress' : 'pointer',
                fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 600,
                background: periode === p.key ? 'var(--surface)' : 'transparent',
                color: periode === p.key ? 'var(--fg)' : 'var(--fg-muted)',
                boxShadow: periode === p.key ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Te keuren door mij — de ingang tot het accorderen. Zonder financieel-recht krijg je
            toch alleen je eigen werk te zien, dus is de knop dan niet uit te zetten. */}
        {magAlles && (
          <button
            type="button"
            onClick={() => setAlleenMijn(v => !v)}
            disabled={teKeuren.length === 0 && !alleenMijn}
            style={{
              padding: '7px 13px', borderRadius: 8, cursor: teKeuren.length === 0 && !alleenMijn ? 'default' : 'pointer',
              fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 700,
              border: `1px solid ${alleenMijn ? '#009439' : 'var(--border)'}`,
              background: alleenMijn ? 'rgba(0,148,57,0.10)' : 'var(--surface)',
              color: alleenMijn ? '#009439' : (teKeuren.length === 0 ? 'var(--fg-muted)' : 'var(--fg)'),
            }}
          >
            Te keuren door mij ({teKeuren.length})
          </button>
        )}

        {alleenMijn && (
          <button
            type="button"
            disabled={keurBezig || (zichtbaar ?? teKeuren).length === 0}
            onClick={async () => {
              const rijen = (zichtbaar ?? teKeuren).filter(magIkKeuren)
              if (!rijen.length) return
              const ok = await bevestig({
                titel: `${rijen.length} uurregels goedkeuren?`,
                omschrijving: `Samen ${uur(rijen.reduce((s, r) => s + r.uren, 0))} uur. Dit betreft alles wat nu zichtbaar is na filteren.`,
                bevestigLabel: 'Goedkeuren',
              })
              if (ok) keur(rijen.map(r => r.bouw7Id!).filter(Boolean))
            }}
            style={{
              padding: '7px 13px', borderRadius: 8, border: 'none',
              cursor: keurBezig ? 'progress' : 'pointer',
              fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 700,
              background: '#009439', color: '#fff', opacity: keurBezig ? 0.6 : 1,
            }}
          >
            {keurBezig ? 'Bezig…' : `Alles zichtbaar goedkeuren`}
          </button>
        )}

        <Stat label={telling.gefilterd ? 'Regels (gefilterd)' : 'Regels'} value={String(telling.regels)} />
        <Stat label="Uren" value={uur(telling.uren)} />
        <Stat label="Arbeidskosten" value={euro(telling.bedrag)} />
        <Stat
          label="Niet geaccordeerd"
          value={String(telling.nietGeaccordeerd)}
          tone={telling.nietGeaccordeerd > 0 ? '#dc2626' : undefined}
        />
      </div>

      {data.fout ? (
        <LegeStaat titel="Uren niet op te halen" tekst={`Bouw7 gaf geen antwoord: ${data.fout}`} />
      ) : data.regels.length === 0 ? (
        <LegeStaat
          titel="Geen uren in deze periode"
          tekst={`Tussen ${datum(data.van)} en ${datum(data.tot)} zijn er geen uren geboekt. Kies een andere periode.`}
        />
      ) : (
        <div style={{ opacity: bezig ? 0.6 : 1 }}>
          <OverzichtTabel
            scherm="uren"
            data={alleenMijn ? teKeuren : data.regels}
            kolommen={kolommen}
            layouts={layouts}
            user_id={user_id}
            beginSortering={[{ id: 'datum', desc: true }]}
            selecteerbaar={false}
            toonRijActie={false}
            dicht
            eenregelig
            groepering={groepering}
            onGefilterd={meldTotalen}
            afvinkKolom={alleenMijn ? {
              status: (r) => magIkKeuren(r) ? 'open' : 'verborgen',
              bezigId: keurId,
              onKlik: (r) => { setKeurId(r.id); keur([r.bouw7Id!]) },
            } : undefined}
            acties={
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--fg-muted)' }}>
                Groeperen
                <select
                  value={groep}
                  onChange={(e) => setGroep(e.target.value as GroepKey)}
                  style={{
                    fontSize: 12.5, fontWeight: 600, color: 'var(--fg)',
                    border: '1px solid var(--border)', borderRadius: 7,
                    padding: '5px 8px', background: 'var(--surface)', cursor: 'pointer',
                  }}
                >
                  {GROEPEN.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
                </select>
              </label>
            }
          />
          <div style={{ padding: '10px 2px 0', fontSize: 11.5, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
            Live uit Bouw7 — {magAlles ? 'alle geboekte uren van interne en externe medewerkers' : 'de uren die op jouw akkoord wachten'} van {datum(data.van)} t/m {datum(data.tot)}.
            {alleenMijn
              ? ' Vink een regel af om hem goed te keuren, of keur in één keer alles goed wat er na filteren nog staat. Wie mag beoordelen volgt uit de teamleider en de projectleider op het dossier.'
              : ' Accorderen kan in Bouw7, of hier met de knop Te keuren door mij.'}
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em', color: 'var(--fg-soft)' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: tone ?? 'var(--fg)', marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}
