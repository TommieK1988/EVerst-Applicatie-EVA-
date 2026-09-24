'use client'

/**
 * Het blok "Meerwerk in termijnstaat" op de Verkoop-tab, met aanvinken en klaarzetten.
 *
 * De regels komen van de server (EVA-meerwerk); of ze nog te factureren zijn weet alleen Bouw7.
 * Die controle loopt live na het laden (`controleerMeerwerkFacturatie`) en niet in de render van
 * de tab: hij leest per verkoopfactuur het hele document, en dat hoort de rest van de tab niet op
 * te houden. Tot hij terug is valt er niets aan te vinken — liever even wachten dan iets
 * aanbieden wat al gefactureerd blijkt.
 *
 * Een regel met één termijn is één vinkje. Volgt het meerwerk het schema van zijn offerte
 * (30/30/30/10), dan staat elke termijn eronder apart: die factureer je op verschillende momenten,
 * niet alle vier tegelijk.
 */

import React, { useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button, RadioGroup, RadioGroupItem, useDialogen } from '@/components/ui'
import { useDossierReadOnly } from '@/components/dossiers/DossierReadOnlyContext'
import { controleerMeerwerkFacturatie, zetMeerwerkKlaar } from '@/lib/dossiers/meerwerk-facturatie'
import type { MeerwerkFacturatieStand } from '@/lib/dossiers/meerwerk-facturatie-stand'
import { fmt, TH, TD } from './tab-ui'

export type MeerwerkBlokRegel = {
  id: string
  code: string
  omschrijving: string | null
  /** Wat er in de termijnstaat komt: "1 termijn", "4 termijnen volgens offerte · 30/30/30/10". */
  verwerking: string
  excl: number
  incl: number
}

const sleutel = (regelId: string, index: number) => `${regelId}:${index}`

export default function MeerwerkKlaarzetBlok({ dossierId, regels, voetnoot }: {
  dossierId: string
  regels: MeerwerkBlokRegel[]
  voetnoot?: string
}) {
  const router = useRouter()
  const readOnly = useDossierReadOnly()
  const { bevestig } = useDialogen()
  const [stand, setStand] = useState<Map<string, MeerwerkFacturatieStand> | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const [gekozen, setGekozen] = useState<Set<string>>(new Set())
  const [wijze, setWijze] = useState<'samen' | 'apart'>('samen')
  const [bezig, start] = useTransition()

  const controleer = useCallback(async () => {
    setFout(null)
    const r = await controleerMeerwerkFacturatie(dossierId).catch(e => ({ ok: false as const, error: String(e) }))
    if (!r.ok) { setFout(r.error); setStand(new Map()); return }
    setStand(new Map(r.regels.map(s => [s.regelId, s])))
  }, [dossierId])

  useEffect(() => { void controleer() }, [controleer])

  const kanKiezen = !readOnly && stand != null
  const keuzes = regels.flatMap(r => (stand?.get(r.id)?.termijnen ?? [])
    .filter(t => !t.gefactureerd && gekozen.has(sleutel(r.id, t.index)))
    .map(t => ({ regelId: r.id, ...t })))
  const totaal = keuzes.reduce((s, t) => s + t.bedragExcl, 0)
  const regelsGekozen = new Set(keuzes.map(k => k.regelId)).size
  const twijfel = [...new Set(keuzes.map(k => k.regelId))].filter(id => stand?.get(id)?.stand === 'twijfel')
  const apart = wijze === 'apart' && regelsGekozen > 1

  function wissel(k: string, aan: boolean) {
    setGekozen(prev => {
      const n = new Set(prev)
      if (aan) n.add(k); else n.delete(k)
      return n
    })
  }

  async function klaarzetten() {
    const ja = await bevestig({
      titel: apart ? `${regelsGekozen} conceptfacturen klaarzetten in Bouw7?` : 'Conceptfactuur klaarzetten in Bouw7?',
      omschrijving: `${keuzes.length} meerwerktermijn${keuzes.length === 1 ? '' : 'en'} van samen ${fmt(totaal)} excl. btw `
        + (apart ? 'komen per meerwerk op een eigen conceptfactuur. '
          : keuzes.length === 1 ? 'komt op een conceptfactuur. ' : 'komen op één conceptfactuur. ')
        + 'Heeft het meerwerk nog geen termijn in Bouw7, dan wordt die eerst in de termijnstaat gezet. '
        + 'De administratie verstuurt de factuur vanuit Bouw7.'
        + (twijfel.length > 0
          ? ` Let op: bij ${twijfel.length} gekozen meerwerk${twijfel.length === 1 ? '' : 'en'} is buiten de `
            + 'termijnen om al iets gefactureerd dat EVA niet kan thuisbrengen. Zet dit alleen klaar als je '
            + 'in Bouw7 hebt gezien dat het nog niet gefactureerd is.'
          : ''),
      bevestigLabel: twijfel.length > 0 ? 'Gecontroleerd, klaarzetten' : 'Klaarzetten',
    })
    if (!ja) return
    const perRegel = new Map<string, number[]>()
    for (const k of keuzes) perRegel.set(k.regelId, [...(perRegel.get(k.regelId) ?? []), k.index])

    start(async () => {
      const r = await zetMeerwerkKlaar(dossierId, [...perRegel].map(([regelId, indexen]) => ({ regelId, indexen })), { apart, twijfelBevestigd: twijfel })
      if (!r.ok) {
        toast.error(r.error, { duration: 12000 })
      } else {
        toast.success(`${r.facturen} conceptfactu${r.facturen === 1 ? 'ur' : 'ren'} klaargezet in Bouw7 — ${r.termijnen} termijn${r.termijnen === 1 ? '' : 'en'}.`)
        if (r.fouten.length > 0) toast.error(r.fouten.join(' · '), { duration: 12000 })
        setGekozen(new Set())
      }
      await controleer()
      router.refresh()
    })
  }

  const statusVan = (s: MeerwerkFacturatieStand | undefined): { tekst: string; kleur: string } => {
    if (!stand) return { tekst: 'Controleren in Bouw7…', kleur: 'var(--neutral-400)' }
    if (!s) return { tekst: fout ? 'Niet te controleren' : '—', kleur: 'var(--neutral-400)' }
    if (s.stand === 'gefactureerd') return { tekst: s.reden ?? 'Gefactureerd', kleur: 'var(--accent)' }
    if (s.stand === 'geblokkeerd') return { tekst: s.reden ?? 'Niet klaar te zetten', kleur: 'var(--neutral-500)' }
    // De uitleg staat op een eigen regel eronder; in de smalle statuskolom zou hij tien regels hoog worden.
    if (s.stand === 'twijfel') return { tekst: '⚠ Controleren in Bouw7', kleur: 'var(--orange-700, #c2410c)' }
    const open = s.termijnen.filter(t => !t.gefactureerd).length
    return {
      tekst: open === s.termijnen.length ? 'Nog te factureren' : `${open} van ${s.termijnen.length} nog te factureren`,
      kleur: 'var(--amber-700, #b45309)',
    }
  }

  const vinkje = (regelId: string, t: { index: number; gefactureerd: boolean }, label: string) => (
    <input
      type="checkbox"
      checked={gekozen.has(sleutel(regelId, t.index))}
      disabled={bezig || t.gefactureerd}
      aria-label={label}
      onChange={e => wissel(sleutel(regelId, t.index), e.target.checked)}
    />
  )

  return (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
        <thead>
          <tr>
            {kanKiezen && <TH>{''}</TH>}
            <TH>#</TH>
            <TH breedte="40%">Omschrijving</TH>
            <TH>Verwerking</TH>
            <TH right>Excl. BTW</TH>
            <TH right>Incl. BTW</TH>
            <TH>Status</TH>
          </tr>
        </thead>
        <tbody>
          {regels.map(r => {
            const s = stand?.get(r.id)
            const st = statusVan(s)
            const termijnen = s && s.stand !== 'geblokkeerd' ? s.termijnen : []
            const enkel = termijnen.length === 1 ? termijnen[0] : null
            return (
              <React.Fragment key={r.id}>
                <tr>
                  {kanKiezen && <TD>{enkel ? vinkje(r.id, enkel, `${r.code} selecteren`) : null}</TD>}
                  <TD>{r.code}</TD>
                  <TD wrap>{r.omschrijving}</TD>
                  <TD kleur="var(--neutral-500)">{r.verwerking}</TD>
                  <TD right vet>{fmt(r.excl)}</TD>
                  <TD right kleur="var(--neutral-500)">{fmt(r.incl)}</TD>
                  <TD wrap kleur={st.kleur}>{st.tekst}</TD>
                </tr>
                {s?.stand === 'twijfel' && (
                  <tr>
                    <td colSpan={kanKiezen ? 7 : 6} style={{
                      padding: '0 12px 8px', fontSize: 12, color: 'var(--orange-700, #c2410c)',
                      paddingLeft: kanKiezen ? 44 : 12,
                    }}>
                      {s.reden}
                    </td>
                  </tr>
                )}
                {/* Meerdere termijnen: elk een eigen regel, want ze worden op verschillende
                    momenten gefactureerd. */}
                {termijnen.length > 1 && termijnen.map(t => (
                  <tr key={t.index} style={{ background: 'var(--neutral-50)' }}>
                    {kanKiezen && <TD>{vinkje(r.id, t, `${r.code} ${t.omschrijving} selecteren`)}</TD>}
                    <TD>{''}</TD>
                    <TD wrap kleur="var(--neutral-600)">{t.omschrijving}</TD>
                    <TD>{''}</TD>
                    <TD right>{fmt(t.bedragExcl)}</TD>
                    <TD>{''}</TD>
                    <TD kleur={t.gefactureerd ? 'var(--accent)' : 'var(--amber-700, #b45309)'}>
                      {t.gefactureerd ? 'Gefactureerd' : t.bouw7TermId == null ? 'Nog geen termijn' : 'Nog te factureren'}
                    </TD>
                  </tr>
                ))}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>

      {fout && (
        <div style={{ padding: '8px 12px', fontSize: 12.5, color: 'var(--orange-700, #c2410c)' }}>
          ⚠ {fout} <button type="button" onClick={() => { setStand(null); void controleer() }}
            style={{ textDecoration: 'underline', background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer' }}>
            Opnieuw proberen
          </button>
        </div>
      )}

      {kanKiezen && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap',
          gap: 12, padding: '10px 12px', borderTop: '1px solid var(--neutral-100)',
        }}>
          <span style={{ fontSize: 12.5, color: 'var(--neutral-500)' }}>
            {keuzes.length === 0
              ? 'Vink het meerwerk aan dat gefactureerd mag worden. Wat al op een factuur staat is niet te kiezen.'
              : `${keuzes.length} geselecteerd — ${fmt(totaal)} excl. btw`}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginLeft: 'auto' }}>
            {regelsGekozen > 1 && (
              <RadioGroup value={wijze} onValueChange={v => setWijze(v as 'samen' | 'apart')} disabled={bezig}
                aria-label="Hoe het meerwerk gefactureerd wordt" style={{ display: 'flex', gap: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--neutral-700)', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                  <RadioGroupItem value="samen" /> Samen op 1 factuur
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--neutral-700)', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                  <RadioGroupItem value="apart" /> Elk meerwerk een eigen factuur
                </label>
              </RadioGroup>
            )}
            <Button variant="primary" onClick={klaarzetten} disabled={bezig || keuzes.length === 0}>
              {bezig ? 'Bezig…' : apart ? `${regelsGekozen} facturen klaarzetten` : `Klaarzetten in Bouw7 (${keuzes.length})`}
            </Button>
          </div>
        </div>
      )}

      {voetnoot && (
        <div style={{ fontSize: 11.5, color: 'var(--neutral-500)', padding: '8px 12px' }}>{voetnoot}</div>
      )}
    </>
  )
}
