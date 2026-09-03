'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui'
import { useDialogen } from '@/components/ui/dialogen'
import OverzichtTabel, { type KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import type { GebruikerLayout } from '@everts/database/platform-types'
import {
  getMijnTeKeurenUren, keurAlsTeamleider, keurAlsProjectleider, corrigeerUurregel,
  type OpenUurRegel,
} from '@/lib/uren/bouw7-goedkeuring'

/**
 * De uren die in Bouw7 zijn ingevoerd en nog op akkoord wachten.
 *
 * De lijst wordt pas geladen als dit tabblad open gaat: het ophalen loopt via Bouw7 en duurt een
 * seconde of wat — dat mag de andere tabbladen niet vertragen.
 *
 * Goedkeuren gaat per regel (het vinkje links) of in bulk over alles wat er ná filteren nog staat.
 * Dat laatste is bewust geen selectievakje-werk: met honderden regels is filteren op een medewerker
 * of een week en dan "keur deze goed" sneller dan een voor een aanvinken.
 */

const uur = (n: number) => n.toLocaleString('nl-NL', { maximumFractionDigits: 2 })
const euro = (n: number) => `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function datumKort(d: string) {
  if (!d) return '—'
  return new Date(`${d}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: '2-digit' })
}

/** ISO-weeknummer; de goedkeurder denkt in weken, niet in losse datums. */
function isoWeek(d: string): number {
  const dt = new Date(`${d}T12:00:00`)
  const isoDag = dt.getDay() === 0 ? 7 : dt.getDay()
  dt.setDate(dt.getDate() + 4 - isoDag)
  const eersteJan = new Date(dt.getFullYear(), 0, 1, 12, 0, 0, 0)
  return Math.ceil(((dt.getTime() - eersteJan.getTime()) / 86400000 + 1) / 7)
}

/** OverzichtTabel wil een string-id; het Bouw7-id blijft als `hourLogId` bewaard. */
type Rij = Omit<OpenUurRegel, 'id'> & { id: string; hourLogId: number; week: number }

const naarRij = (r: OpenUurRegel): Rij => ({
  ...r, id: String(r.id), hourLogId: r.id, week: r.datum ? isoWeek(r.datum) : 0,
})

type Rol = 'teamleider' | 'projectleider'

export default function Bouw7UrenClient({
  layouts, userId,
}: {
  layouts: GebruikerLayout[]
  userId: string | null
}) {
  const router = useRouter()
  const [, startT] = useTransition()
  const { vraagTekst, bevestig } = useDialogen()

  const jaar = new Date().getFullYear()
  const [van, setVan] = useState(`${jaar}-01-01`)
  const [tot, setTot] = useState(`${jaar}-12-31`)

  const [rol, setRol] = useState<Rol>('teamleider')
  const [data, setData] = useState<{ tl: Rij[]; pl: Rij[]; los: Rij[] } | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const [laden, setLaden] = useState(true)
  const [bezigId, setBezigId] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)
  const [zichtbaar, setZichtbaar] = useState<Rij[]>([])

  const laad = useCallback(async () => {
    setLaden(true)
    const r = await getMijnTeKeurenUren(van, tot)
    setFout(r.fout)
    setData({
      tl: r.alsTeamleider.map(naarRij),
      pl: r.alsProjectleider.map(naarRij),
      los: r.nietToeTeWijzen.map(naarRij),
    })
    setLaden(false)
  }, [van, tot])

  useEffect(() => { laad() }, [laad])

  const rijen = useMemo(() => {
    if (!data) return []
    return rol === 'teamleider' ? data.tl : data.pl
  }, [data, rol])

  async function keur(ids: number[]) {
    if (!ids.length) return
    setBezig(true)
    const r = rol === 'teamleider' ? await keurAlsTeamleider(ids) : await keurAlsProjectleider(ids)
    setBezig(false)
    setBezigId(null)
    if (!r.ok) { toast.error(r.error); return }

    // In de teamleider-rol gaat de vlag alleen naar Bouw7 als er geen projectleider is; dat verschil
    // moet de gebruiker zien, anders denkt hij dat het klaar is terwijl er nog iemand moet kijken.
    const wachtNog = r.verwerkt - r.naarBouw7
    toast.success(
      r.naarBouw7 > 0 && wachtNog > 0 ? `${r.naarBouw7} goedgekeurd in Bouw7, ${wachtNog} wacht nog op de projectleider.`
      : r.naarBouw7 > 0 ? `${r.naarBouw7} regel${r.naarBouw7 === 1 ? '' : 's'} goedgekeurd in Bouw7.`
      : `${r.verwerkt} akkoord — wacht nu op de projectleider.`,
    )
    if (r.mislukt > 0) toast.error(`${r.mislukt} regel(s) niet gelukt: ${r.fouten[0] ?? ''}`)
    await laad()
    startT(() => router.refresh())
  }

  async function corrigeer(rij: Rij) {
    const nieuw = await vraagTekst({
      titel: `Uren aanpassen — ${rij.medewerkerNaam}, ${datumKort(rij.datum)}`,
      omschrijving: `Nu ${uur(rij.uren)} uur op ${rij.projectNummer ?? rij.projectNaam ?? 'onbekend project'}. De medewerker krijgt bericht van de wijziging.`,
      label: 'Aantal uren',
      standaard: String(rij.uren),
      verplicht: true,
      bevestigLabel: 'Aanpassen',
    })
    if (!nieuw?.trim()) return
    const getal = parseFloat(nieuw.replace(',', '.'))
    if (Number.isNaN(getal)) { toast.error('Vul een geldig aantal uren in.'); return }

    setBezigId(rij.id)
    const r = await corrigeerUurregel(rij.hourLogId, { uren: getal })
    setBezigId(null)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Aangepast; de medewerker heeft bericht gekregen.')
    await laad()
  }

  const kolommen: KolomDefinitie<Rij>[] = useMemo(() => [
    { key: 'medewerkerNaam', label: 'Medewerker', vast: true, render: r => r.medewerkerNaam },
    { key: 'datum', label: 'Datum', render: r => datumKort(r.datum), sorteerWaarde: r => r.datum },
    { key: 'week', label: 'Week', render: r => `wk ${r.week}`, sorteerWaarde: r => r.week },
    {
      key: 'project', label: 'Project',
      render: r => r.projectNummer ? `${r.projectNummer} · ${r.projectNaam ?? ''}` : (r.projectNaam ?? '—'),
      sorteerWaarde: r => r.projectNummer ?? '',
    },
    { key: 'uursoort', label: 'Uursoort', filterType: 'select', render: r => r.uursoort ?? '—', filterWaarde: r => r.uursoort ?? '' },
    { key: 'bewakingscode', label: 'Bewakingscode', render: r => r.bewakingscode ?? '—' },
    { key: 'projectleiderNaam', label: 'Projectleider', filterType: 'select', render: r => r.projectleiderNaam ?? '—', filterWaarde: r => r.projectleiderNaam ?? '' },
    {
      key: 'status', label: 'Status', filterType: 'select',
      filterWaarde: r => r.tlAkkoord ? 'Teamleider akkoord' : 'Nog niet beoordeeld',
      render: r => r.tlAkkoord
        ? <span style={{ color: '#0b6bcb', fontWeight: 600 }}>teamleider akkoord</span>
        : <span style={{ color: 'var(--fg-muted)' }}>nog niet beoordeeld</span>,
    },
    { key: 'uren', label: 'Uren', render: r => uur(r.uren), sorteerWaarde: r => r.uren },
    { key: 'bedrag', label: 'Bedrag', standaard_zichtbaar: false, render: r => euro(r.bedrag), sorteerWaarde: r => r.bedrag },
    { key: 'opmerking', label: 'Opmerking', standaard_zichtbaar: false, render: r => r.opmerking ?? '—' },
  ], [])

  const zichtbareUren = zichtbaar.reduce((s, r) => s + r.uren, 0)
  const losseRegels = data?.los.length ?? 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Rol + periode */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {([['teamleider', `Als teamleider (${data?.tl.length ?? 0})`],
             ['projectleider', `Als projectleider (${data?.pl.length ?? 0})`]] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setRol(k)}
              style={{
                padding: '7px 12px', borderRadius: 8, cursor: 'pointer',
                fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 700,
                border: `1px solid ${rol === k ? 'var(--fg)' : 'var(--border)'}`,
                background: rol === k ? 'var(--fg)' : 'transparent',
                color: rol === k ? 'var(--bg)' : 'var(--fg-muted)',
              }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg-muted)' }}>periode</span>
          <input type="date" value={van} onChange={e => setVan(e.target.value)} style={datumVeld} />
          <input type="date" value={tot} onChange={e => setTot(e.target.value)} style={datumVeld} />
        </div>
      </div>

      {fout && (
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: '#c0392b', margin: 0 }}>
          Bouw7 is niet bereikbaar: {fout}
        </p>
      )}

      {losseRegels > 0 && (
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: '#a15c00', margin: 0 }}>
          {losseRegels} openstaande uurregel{losseRegels === 1 ? '' : 's'} hoort bij een medewerker of
          project dat EVA niet kent. Die zijn hier niet te beoordelen en moeten in Bouw7 afgehandeld
          worden, of de koppeling moet gerepareerd.
        </p>
      )}

      {laden ? (
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)' }}>
          Bezig met ophalen uit Bouw7…
        </p>
      ) : rijen.length === 0 ? (
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)' }}>
          {rol === 'teamleider'
            ? 'Er staan geen uren van je team op jouw akkoord in deze periode.'
            : 'Er staan geen uren op jouw projecten in deze periode.'}
        </p>
      ) : (
        <OverzichtTabel<Rij>
          scherm={`uren-bouw7-${rol}`}
          data={rijen}
          kolommen={kolommen}
          layouts={layouts}
          user_id={userId}
          selecteerbaar={false}
          toonRijActie={false}
          dicht
          beginSortering={[{ id: 'datum', desc: true }]}
          onGefilterd={setZichtbaar}
          afvinkKolom={{
            status: () => 'open',
            bezigId,
            onKlik: r => { setBezigId(r.id); keur([r.hourLogId]) },
          }}
          groepering={{
            sleutel: r => r.medewerkerNaam,
            kop: (rs, sleutel) => (
              <span>
                <strong>{sleutel}</strong>
                <span style={{ color: 'var(--fg-muted)', fontWeight: 500 }}>
                  {' '}· {rs.length} regel{rs.length === 1 ? '' : 's'} · {uur(rs.reduce((s, r) => s + r.uren, 0))} uur
                </span>
              </span>
            ),
          }}
          acties={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)' }}>
                {zichtbaar.length} regels · {uur(zichtbareUren)} uur
              </span>
              <Button
                variant="primary" size="sm" disabled={bezig || zichtbaar.length === 0}
                onClick={async () => {
                  const ok = await bevestig({
                    titel: `${zichtbaar.length} regels goedkeuren?`,
                    omschrijving: `Samen ${uur(zichtbareUren)} uur. Dit betreft alles wat nu zichtbaar is na filteren.`,
                    bevestigLabel: 'Goedkeuren',
                  })
                  if (ok) keur(zichtbaar.map(r => r.hourLogId))
                }}>
                Alles zichtbaar goedkeuren
              </Button>
            </div>
          }
          onRijKlik={corrigeer}
        />
      )}

      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg-muted)', margin: 0 }}>
        Klik een regel aan om de uren aan te passen — de medewerker krijgt daar bericht van. Als
        teamleider gaat je akkoord pas naar Bouw7 zodra ook de projectleider heeft gekeken; heeft het
        project geen projectleider, dan meteen.
      </p>
    </div>
  )
}

const datumVeld: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 12, padding: '5px 8px',
  border: '1px solid var(--border)', borderRadius: 6,
  background: 'var(--bg-elev)', color: 'var(--fg)',
}
