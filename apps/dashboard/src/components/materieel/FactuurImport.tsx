'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader, Button } from '@/components/ui'
import { CATEGORIE_LABELS, MATERIEEL_CATEGORIEEN, type MaterieelCategorie, type Optie } from '@/lib/materieel/types'
import type { VoorstelRegel } from '@/lib/materieel/factuur-import/poort'
import {
  analyseerFactuur, bewaarVoorstel, verwerpVoorstel, type AnalyseResultaat,
} from '@/app/(platform)/materieelbeheer/factuur-import/actions'

/** Eén regel zoals hij in het scherm staat: het voorstel plus wat de gebruiker eraan verandert. */
interface BewerkteRegel {
  regelId: string
  aan: boolean
  omschrijving: string
  categorie: MaterieelCategorie
  merk: string
  type: string
  serienummer: string
  aantal: number
  stukprijs: string
  artikelcode: string | null
  opmerkingen: string
  medewerkerId: string
  /** Waarom de AI dit wel of geen materieel vond — blijft zichtbaar als toelichting. */
  reden: string | null
  isMaterieel: boolean
}

const veld: React.CSSProperties = {
  width: '100%', padding: '5px 7px', borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--fg)',
  fontFamily: 'var(--font-ui)', fontSize: 12.5,
}
const kop: React.CSSProperties = {
  textAlign: 'left', padding: '8px 6px', fontFamily: 'var(--font-ui)', fontSize: 11,
  fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em',
  color: 'var(--fg-muted)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
}
const cel: React.CSSProperties = { padding: '6px', verticalAlign: 'top' }

function naarRegel(r: VoorstelRegel, standaardHouder: string): BewerkteRegel {
  return {
    regelId: r.regelId,
    aan: r.standaardAan,
    omschrijving: r.omschrijving,
    categorie: r.categorie ?? 'gereedschap',
    merk: r.merk ?? '',
    type: r.type ?? '',
    serienummer: r.serienummer ?? '',
    aantal: r.aantal,
    stukprijs: r.stukprijs === null ? '' : String(r.stukprijs),
    artikelcode: r.artikelcode,
    // De setinhoud is het soort ding dat je een jaar later wilt terugvinden, dus
    // die hoort in de opmerking en niet alleen in het AI-antwoord.
    opmerkingen: [r.opmerking, r.set_inhoud && `Set bevat volgens de factuur: ${r.set_inhoud}`]
      .filter(Boolean).join(' ').trim(),
    medewerkerId: r.standaardAan ? standaardHouder : '',
    reden: r.reden,
    isMaterieel: r.is_materieel,
  }
}

export default function FactuurImport({ medewerkerOpties }: { medewerkerOpties: Optie[] }) {
  const router = useRouter()
  const [bestand, setBestand] = React.useState<File | null>(null)
  const [bezig, setBezig] = React.useState<null | 'lezen' | 'opslaan'>(null)
  const [fout, setFout] = React.useState<string | null>(null)
  const [analyse, setAnalyse] = React.useState<AnalyseResultaat | null>(null)
  const [regels, setRegels] = React.useState<BewerkteRegel[]>([])
  const [datum, setDatum] = React.useState('')

  const aantalAan = regels.filter((r) => r.aan).length
  const stuksAan = regels.filter((r) => r.aan).reduce((s, r) => s + r.aantal, 0)

  async function lees() {
    if (!bestand) return
    setBezig('lezen'); setFout(null)
    const fd = new FormData()
    fd.set('bestand', bestand)
    const res = await analyseerFactuur(fd)
    setBezig(null)
    if (!res.ok) { setFout(res.error); return }

    const v = res.data.voorstel
    const houder = v.toewijzenToegestaan && v.koppeling.soort === 'gekoppeld' ? v.koppeling.id : ''
    setAnalyse(res.data)
    setRegels(v.regels.map((r) => naarRegel(r, houder)))
    setDatum(v.leverdatum ?? v.factuurdatum ?? '')
  }

  async function opslaan() {
    if (!analyse) return
    const gekozen = regels.filter((r) => r.aan)
    if (gekozen.length === 0) { setFout('Vink eerst aan wat in het register moet.'); return }

    setBezig('opslaan'); setFout(null)
    const v = analyse.voorstel
    const res = await bewaarVoorstel({
      staging: analyse.staging,
      bestandsnaam: analyse.bestandsnaam,
      leverancier: v.leverancier,
      factuurnummer: v.factuurnummer,
      factuurdatum: v.factuurdatum,
      bonnummer: v.bonnummer,
      administratie: v.administratie,
      naamOpFactuur: v.naamOpFactuur,
      regels: gekozen.map((r) => ({
        omschrijving: r.omschrijving.trim(),
        categorie: r.categorie,
        merk: r.merk.trim() || null,
        type: r.type.trim() || null,
        serienummer: r.serienummer.trim() || null,
        aankoopdatum: /^\d{4}-\d{2}-\d{2}$/.test(datum) ? datum : null,
        aantal: r.aantal,
        stukprijs: r.stukprijs.trim() === '' ? null : Number(r.stukprijs.replace(',', '.')),
        artikelcode: r.artikelcode,
        opmerkingen: r.opmerkingen.trim() || null,
        medewerkerId: r.medewerkerId || null,
      })),
    })
    setBezig(null)
    if (!res.ok) { setFout(res.error); return }

    const staart = res.data.zonderFactuur > 0
      ? ` (bij ${res.data.zonderFactuur} lukte het niet de factuur als bijlage toe te voegen)`
      : ''
    router.push(`/materieelbeheer?melding=${encodeURIComponent(`${res.data.aangemaakt} objecten toegevoegd${staart}`)}`)
    router.refresh()
  }

  async function opnieuw() {
    if (analyse) await verwerpVoorstel(analyse.staging)
    setAnalyse(null); setRegels([]); setBestand(null); setFout(null)
  }

  function wijzig(id: string, patch: Partial<BewerkteRegel>) {
    setRegels((rs) => rs.map((r) => (r.regelId === id ? { ...r, ...patch } : r)))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        eyebrow="Materieelbeheer"
        title="Factuur inlezen"
        actions={analyse ? <Button variant="outline" onClick={opnieuw}>Andere factuur</Button> : undefined}
      />

      {fout && (
        <div style={{
          padding: '10px 12px', borderRadius: 8, fontSize: 13, fontFamily: 'var(--font-ui)',
          background: 'hsl(var(--destructive) / 0.08)', color: 'hsl(var(--destructive))',
          border: '1px solid hsl(var(--destructive) / 0.35)',
        }}>{fout}</div>
      )}

      {!analyse && (
        <div style={{
          border: '1px solid var(--border)', borderRadius: 12, padding: 20,
          background: 'var(--bg-elevated)', display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <p style={{ margin: 0, fontFamily: 'var(--font-ui)', fontSize: 13.5, color: 'var(--fg-muted)', maxWidth: 620 }}>
            Kies de PDF van een inkoopfactuur. EVA leest hem en stelt voor welke regels als materieel in
            het register horen. Je ziet álle factuurregels — ook het verbruik dat niet meegaat — en je
            beslist zelf wat er uiteindelijk wordt opgeslagen. Er wordt nog niets bewaard.
          </p>
          <input
            type="file" accept="application/pdf"
            onChange={(e) => { setBestand(e.target.files?.[0] ?? null); setFout(null) }}
            style={{ fontFamily: 'var(--font-ui)', fontSize: 13 }}
          />
          <div>
            <Button onClick={lees} disabled={!bestand || bezig !== null}>
              {bezig === 'lezen' ? 'Bezig met lezen…' : 'Factuur lezen'}
            </Button>
          </div>
        </div>
      )}

      {analyse && (
        <>
          <div style={{
            border: '1px solid var(--border)', borderRadius: 12, padding: 16,
            background: 'var(--bg-elevated)', display: 'flex', flexWrap: 'wrap', gap: 20,
            fontFamily: 'var(--font-ui)', fontSize: 13,
          }}>
            <Gegeven label="Leverancier" waarde={analyse.voorstel.leverancier} />
            <Gegeven label="Factuurnummer" waarde={analyse.voorstel.factuurnummer} />
            <Gegeven label="Administratie" waarde={analyse.voorstel.administratie} />
            <Gegeven label="Naam op factuur" waarde={analyse.voorstel.naamOpFactuur} />
            <div>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 700 }}>
                Aankoopdatum
              </div>
              <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} style={{ ...veld, width: 150, marginTop: 3 }} />
            </div>
          </div>

          {analyse.voorstel.waarschuwingen.length > 0 && (
            <ul style={{
              margin: 0, padding: '10px 12px 10px 28px', borderRadius: 8,
              // Let op: er bestaat geen token `--warning`; de statuskleuren heten
              // `--warning-50/300/900` en zijn volledige kleuren die zelf meekantelen
              // in donkere modus. `hsl(var(--warning) / …)` levert stil niets op.
              background: 'var(--warning-50)', border: '1px solid var(--warning-300)',
              fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--warning-900)',
              display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              {analyse.voorstel.waarschuwingen.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}

          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-elevated)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
              <thead>
                <tr>
                  <th style={{ ...kop, width: 34 }} />
                  <th style={{ ...kop, minWidth: 220 }}>Omschrijving</th>
                  <th style={{ ...kop, width: 150 }}>Categorie</th>
                  <th style={{ ...kop, width: 110 }}>Merk</th>
                  <th style={{ ...kop, width: 130 }}>Type</th>
                  <th style={{ ...kop, width: 130 }}>Serienummer</th>
                  <th style={{ ...kop, width: 66 }}>Aantal</th>
                  <th style={{ ...kop, width: 90 }}>Stukprijs</th>
                  <th style={{ ...kop, width: 170 }}>Bij wie</th>
                </tr>
              </thead>
              <tbody>
                {regels.map((r) => (
                  <tr key={r.regelId} style={{
                    borderTop: '1px solid var(--border)',
                    opacity: r.aan ? 1 : 0.55,
                    background: r.aan ? undefined : 'var(--surface-2)',
                  }}>
                    <td style={{ ...cel, textAlign: 'center' }}>
                      <input
                        type="checkbox" checked={r.aan}
                        onChange={(e) => wijzig(r.regelId, { aan: e.target.checked })}
                        style={{ width: 16, height: 16, cursor: 'pointer' }}
                      />
                    </td>
                    <td style={cel}>
                      <input value={r.omschrijving} onChange={(e) => wijzig(r.regelId, { omschrijving: e.target.value })} style={veld} />
                      {!r.isMaterieel && r.reden && (
                        <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 3, fontFamily: 'var(--font-ui)' }}>
                          Niet voorgesteld: {r.reden}
                        </div>
                      )}
                      {r.opmerkingen && (
                        <input
                          value={r.opmerkingen} onChange={(e) => wijzig(r.regelId, { opmerkingen: e.target.value })}
                          style={{ ...veld, marginTop: 4, fontSize: 11.5, color: 'var(--fg-muted)' }}
                        />
                      )}
                    </td>
                    <td style={cel}>
                      <select value={r.categorie} onChange={(e) => wijzig(r.regelId, { categorie: e.target.value as MaterieelCategorie })} style={veld}>
                        {MATERIEEL_CATEGORIEEN.map((c) => <option key={c} value={c}>{CATEGORIE_LABELS[c]}</option>)}
                      </select>
                    </td>
                    <td style={cel}><input value={r.merk} onChange={(e) => wijzig(r.regelId, { merk: e.target.value })} style={veld} /></td>
                    <td style={cel}><input value={r.type} onChange={(e) => wijzig(r.regelId, { type: e.target.value })} style={veld} /></td>
                    <td style={cel}>
                      <input value={r.serienummer} onChange={(e) => wijzig(r.regelId, { serienummer: e.target.value })} style={veld} />
                      {r.aantal > 1 && r.serienummer && (
                        <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 3, fontFamily: 'var(--font-ui)' }}>
                          Bij meer dan 1 stuk wordt het serienummer niet overgenomen.
                        </div>
                      )}
                    </td>
                    <td style={cel}>
                      <input
                        type="number" min={1} max={200} value={r.aantal}
                        onChange={(e) => wijzig(r.regelId, { aantal: Math.max(1, Number(e.target.value) || 1) })}
                        style={veld}
                      />
                    </td>
                    <td style={cel}>
                      <input
                        inputMode="decimal" value={r.stukprijs} placeholder="—"
                        onChange={(e) => wijzig(r.regelId, { stukprijs: e.target.value })}
                        style={veld}
                      />
                    </td>
                    <td style={cel}>
                      <select value={r.medewerkerId} onChange={(e) => wijzig(r.regelId, { medewerkerId: e.target.value })} style={veld}>
                        <option value="">Algemeen gebruik</option>
                        {medewerkerOpties.map((m) => <option key={m.id} value={m.id}>{m.naam}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <Button onClick={opslaan} disabled={bezig !== null || aantalAan === 0}>
              {bezig === 'opslaan' ? 'Bezig met opslaan…' : `${stuksAan} object${stuksAan === 1 ? '' : 'en'} toevoegen`}
            </Button>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--fg-muted)' }}>
              {aantalAan} van {regels.length} factuurregels aangevinkt. De factuur wordt als bijlage aan
              elk object gehangen.
            </span>
          </div>
        </>
      )}
    </div>
  )
}

function Gegeven({ label, waarde }: { label: string; waarde: string | null }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ marginTop: 3, color: 'var(--fg)' }}>{waarde || '—'}</div>
    </div>
  )
}
