'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import type {
  KwaliteitBronType,
  KwaliteitControlepunt,
  KwaliteitDiscipline,
  KwaliteitErnst,
} from '@everts/database/kwaliteit-types'
import {
  KWALITEIT_MEETMIDDELEN,
  kwaliteitBronTypeLabels,
  kwaliteitErnstLabels,
  kwaliteitInspectieTypeLabels,
} from '@everts/database/kwaliteit-types'
import { updateControlepunt } from '@/lib/kwaliteit/bibliotheek'
import { bepaalEis, eisOmschrijving } from '@/lib/kwaliteit/regels'
import { PageHeader, Badge, Card, CardBody } from '@/components/ui'

const zacht = { fontSize: 13, color: 'var(--fg-muted)' } as const
const invoer: React.CSSProperties = {
  width: '100%', padding: '7px 9px', borderRadius: 8, fontSize: 13,
  border: '1px solid var(--border)', background: 'var(--bg-elev)', color: 'var(--fg)',
  fontFamily: 'inherit', boxSizing: 'border-box',
}
const veldLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
  color: 'var(--fg-muted)', display: 'block', marginBottom: 3,
}

/**
 * Beheer van de technische controlepunten (§52).
 *
 * Hier — en niet in de formulierenbouwer — worden de kwaliteitseisen onderhouden. Grenswaarde,
 * meetmethode, bron, verplichte foto, ernst en rapporttekst zijn allemaal data, zodat de
 * bibliotheek kan meegroeien zonder dat er broncode aan te pas komt.
 *
 * `code` en `discipline_code` zijn bewust niet te wijzigen: bestaande afwijkingen en verzonden
 * rapporten verwijzen naar die code.
 */
export default function BibliotheekBeheer({
  punten,
  disciplines,
  magBeheren,
}: {
  punten: KwaliteitControlepunt[]
  disciplines: KwaliteitDiscipline[]
  magBeheren: boolean
}) {
  const [actief, setActief] = React.useState<string>(disciplines[0]?.code ?? 'ALG')
  const [zoek, setZoek] = React.useState('')

  const zichtbaar = React.useMemo(() => {
    const term = zoek.trim().toLowerCase()
    return punten.filter(p => {
      if (term) {
        return p.code.toLowerCase().includes(term)
          || p.titel.toLowerCase().includes(term)
          || p.korte_vraag.toLowerCase().includes(term)
      }
      return p.discipline_code === actief
    })
  }, [punten, actief, zoek])

  const aantalPerDiscipline = React.useMemo(() => {
    const m = new Map<string, number>()
    for (const p of punten) m.set(p.discipline_code, (m.get(p.discipline_code) ?? 0) + 1)
    return m
  }, [punten])

  const nietGeverifieerd = punten.filter(p => p.bron_type === 'INTERN' && p.bron_document).length

  return (
    <div className="eva-page-full">
      <PageHeader eyebrow="KAM / VGM" title="Kwaliteitsbibliotheek" />
      <p style={{ margin: '-14px 0 8px', fontSize: 13.5, color: 'var(--fg-muted)', maxWidth: 780 }}>
        {punten.length} controlepunten over {disciplines.length} disciplines. Wat je hier wijzigt
        geldt vanaf de volgende inspectie; lopende en afgeronde inspecties houden de eis die op het
        inspectiemoment gold.
      </p>
      {nietGeverifieerd > 0 && (
        <p style={{
          margin: '0 0 18px', padding: '10px 12px', borderRadius: 10, maxWidth: 780,
          background: 'var(--warning-50)', border: '1px solid var(--warning-300)',
          color: 'var(--warning-700)', fontSize: 12.5, lineHeight: 1.5,
        }}>
          {nietGeverifieerd} controlepunten staan als <strong>interne bedrijfsnorm</strong> vastgelegd
          met een verwijzing naar een externe bron. Zet een punt pas op &ldquo;Norm&rdquo; zodra
          iemand die norm daadwerkelijk heeft nageslagen — het rapport toont de bron aan de
          opdrachtgever.
        </p>
      )}

      {!magBeheren && (
        <p style={{ ...zacht, marginBottom: 14 }}>
          Je kunt de bibliotheek bekijken maar niet wijzigen.
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={zoek}
          onChange={e => setZoek(e.target.value)}
          placeholder="Zoek op code, titel of vraag…"
          style={{ ...invoer, maxWidth: 320 }}
        />
        {zoek && <span style={zacht}>{zichtbaar.length} resultaten</span>}
      </div>

      {!zoek && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
          {disciplines.map(d => (
            <button
              key={d.code}
              type="button"
              onClick={() => setActief(d.code)}
              style={{
                padding: '7px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 600,
                border: `1px solid ${actief === d.code ? 'var(--color-primary)' : 'var(--border)'}`,
                background: actief === d.code ? 'var(--color-primary)' : 'transparent',
                color: actief === d.code ? 'var(--color-primary-fg)' : 'var(--fg-muted)',
                cursor: 'pointer',
              }}
            >
              {d.naam} <span style={{ opacity: 0.7 }}>{aantalPerDiscipline.get(d.code) ?? 0}</span>
            </button>
          ))}
        </div>
      )}

      {zichtbaar.map(p => (
        <PuntRij key={p.id} punt={p} magBeheren={magBeheren} />
      ))}

      {zichtbaar.length === 0 && (
        <p style={{ ...zacht, textAlign: 'center', padding: '32px 0' }}>Geen controlepunten gevonden.</p>
      )}
    </div>
  )
}

function PuntRij({ punt, magBeheren }: { punt: KwaliteitControlepunt; magBeheren: boolean }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [vorm, setVorm] = React.useState(punt)
  const [bezig, setBezig] = React.useState(false)

  const gewijzigd = React.useMemo(
    () => JSON.stringify(vorm) !== JSON.stringify(punt),
    [vorm, punt],
  )
  // De eis zoals hij zonder projectwaarden geldt: dat is wat hier wordt beheerd.
  const eis = bepaalEis(vorm, [])

  async function bewaar() {
    setBezig(true)
    const res = await updateControlepunt(punt.id, {
      titel: vorm.titel,
      korte_vraag: vorm.korte_vraag,
      toelichting: vorm.toelichting,
      inspectie_type: vorm.inspectie_type,
      binair_voldoet_bij: vorm.binair_voldoet_bij,
      meting_verplicht: vorm.meting_verplicht,
      meting_optioneel: vorm.meting_optioneel,
      meetmethode: vorm.meetmethode,
      meetmiddel: vorm.meetmiddel,
      eenheid: vorm.eenheid,
      min_waarde: vorm.min_waarde,
      max_waarde: vorm.max_waarde,
      doel_waarde: vorm.doel_waarde,
      tolerantie_min: vorm.tolerantie_min,
      tolerantie_plus: vorm.tolerantie_plus,
      project_eis_sleutel: vorm.project_eis_sleutel,
      bron_type: vorm.bron_type,
      bron_document: vorm.bron_document,
      bron_paragraaf: vorm.bron_paragraaf,
      eis_tekst: vorm.eis_tekst,
      foto_verplicht_bij_afkeur: vorm.foto_verplicht_bij_afkeur,
      foto_altijd_verplicht: vorm.foto_altijd_verplicht,
      sta_niet_beoordeeld: vorm.sta_niet_beoordeeld,
      sta_nvt: vorm.sta_nvt,
      sta_nader_onderzoek: vorm.sta_nader_onderzoek,
      standaard_ernst: vorm.standaard_ernst,
      rapport_tekst_voldoet: vorm.rapport_tekst_voldoet,
      rapport_tekst_voldoet_niet: vorm.rapport_tekst_voldoet_niet,
      standaard_herstelactie: vorm.standaard_herstelactie,
      volgorde: vorm.volgorde,
      actief: vorm.actief,
    })
    setBezig(false)
    if (res.ok) { toast.success(`${punt.code} bijgewerkt`); router.refresh() }
    else toast.error(res.error)
  }

  function zet<K extends keyof KwaliteitControlepunt>(sleutel: K, waarde: KwaliteitControlepunt[K]) {
    setVorm(v => ({ ...v, [sleutel]: waarde }))
  }

  const getal = (v: number | null) => (v === null || v === undefined ? '' : String(v))
  const naarGetal = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')))

  return (
    <Card style={{ marginBottom: 8, opacity: vorm.actief ? 1 : 0.55 }}>
      <CardBody>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          style={{
            width: '100%', display: 'flex', gap: 12, alignItems: 'flex-start',
            background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left',
          }}
        >
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--fg-muted)', minWidth: 66 }}>
            {punt.code}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{vorm.titel}</span>
            <span style={{ display: 'block', ...zacht, marginTop: 2 }}>{vorm.korte_vraag}</span>
          </span>
          <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            {!vorm.actief && <Badge tone="neutral">Inactief</Badge>}
            {(vorm.meting_verplicht || vorm.meting_optioneel) && (
              <Badge tone="info">{eis.geen_waarde_bekend ? 'projecteis' : eisOmschrijving(eis)}</Badge>
            )}
            <Badge tone={vorm.bron_type === 'NORM' ? 'success' : 'neutral'}>
              {kwaliteitBronTypeLabels[vorm.bron_type]}
            </Badge>
            <span style={{ ...zacht }}>{open ? '▴' : '▾'}</span>
          </span>
        </button>

        {open && (
          <div style={{ marginTop: 16, display: 'grid', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <div>
                <label style={veldLabel}>Titel</label>
                <input style={invoer} value={vorm.titel} disabled={!magBeheren}
                  onChange={e => zet('titel', e.target.value)} />
              </div>
              <div>
                <label style={veldLabel}>Volgorde</label>
                <input style={invoer} value={String(vorm.volgorde)} disabled={!magBeheren}
                  onChange={e => zet('volgorde', Number(e.target.value) || 0)} />
              </div>
            </div>

            <div>
              <label style={veldLabel}>Korte vraag (wat de inspecteur leest)</label>
              <input style={invoer} value={vorm.korte_vraag} disabled={!magBeheren}
                onChange={e => zet('korte_vraag', e.target.value)} />
            </div>

            <div>
              <label style={veldLabel}>Toelichting (&ldquo;Waarom controleren?&rdquo;)</label>
              <textarea style={{ ...invoer, minHeight: 60 }} value={vorm.toelichting ?? ''} disabled={!magBeheren}
                onChange={e => zet('toelichting', e.target.value || null)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <div>
                <label style={veldLabel}>Soort controle</label>
                <select style={invoer} value={vorm.inspectie_type} disabled={!magBeheren}
                  onChange={e => zet('inspectie_type', e.target.value as KwaliteitControlepunt['inspectie_type'])}>
                  {Object.entries(kwaliteitInspectieTypeLabels).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={veldLabel}>Goede antwoord</label>
                <select style={invoer} value={vorm.binair_voldoet_bij ?? ''} disabled={!magBeheren}
                  onChange={e => zet('binair_voldoet_bij', (e.target.value || null) as 'ja' | 'nee' | null)}>
                  <option value="">Niet binair</option>
                  <option value="ja">JA voldoet</option>
                  <option value="nee">NEE voldoet</option>
                </select>
              </div>
              <div>
                <label style={veldLabel}>Standaard ernst</label>
                <select style={invoer} value={vorm.standaard_ernst} disabled={!magBeheren}
                  onChange={e => zet('standaard_ernst', e.target.value as KwaliteitErnst)}>
                  {Object.entries(kwaliteitErnstLabels).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Meting */}
            <fieldset style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
              <legend style={{ ...veldLabel, marginBottom: 0, padding: '0 6px' }}>Meting en grenswaarde</legend>
              <div style={{ display: 'flex', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
                <Vink label="Meting verplicht" aan={vorm.meting_verplicht} disabled={!magBeheren}
                  onWissel={v => zet('meting_verplicht', v)} />
                <Vink label="Meting optioneel" aan={vorm.meting_optioneel} disabled={!magBeheren}
                  onWissel={v => zet('meting_optioneel', v)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
                <div>
                  <label style={veldLabel}>Meetmiddel</label>
                  <select style={invoer} value={vorm.meetmiddel ?? ''} disabled={!magBeheren}
                    onChange={e => zet('meetmiddel', e.target.value || null)}>
                    <option value="">—</option>
                    {KWALITEIT_MEETMIDDELEN.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label style={veldLabel}>Eenheid</label>
                  <input style={invoer} value={vorm.eenheid ?? ''} disabled={!magBeheren}
                    onChange={e => zet('eenheid', e.target.value || null)} placeholder="%, mm, °C" />
                </div>
                <div>
                  <label style={veldLabel}>Minimum</label>
                  <input style={invoer} value={getal(vorm.min_waarde)} disabled={!magBeheren}
                    onChange={e => zet('min_waarde', naarGetal(e.target.value))} />
                </div>
                <div>
                  <label style={veldLabel}>Maximum</label>
                  <input style={invoer} value={getal(vorm.max_waarde)} disabled={!magBeheren}
                    onChange={e => zet('max_waarde', naarGetal(e.target.value))} />
                </div>
                <div>
                  <label style={veldLabel}>Streefwaarde</label>
                  <input style={invoer} value={getal(vorm.doel_waarde)} disabled={!magBeheren}
                    onChange={e => zet('doel_waarde', naarGetal(e.target.value))} />
                </div>
                <div>
                  <label style={veldLabel}>Tolerantie −</label>
                  <input style={invoer} value={getal(vorm.tolerantie_min)} disabled={!magBeheren}
                    onChange={e => zet('tolerantie_min', naarGetal(e.target.value))} />
                </div>
                <div>
                  <label style={veldLabel}>Tolerantie +</label>
                  <input style={invoer} value={getal(vorm.tolerantie_plus)} disabled={!magBeheren}
                    onChange={e => zet('tolerantie_plus', naarGetal(e.target.value))} />
                </div>
                <div>
                  <label style={veldLabel}>Projecteis-sleutel</label>
                  <input style={invoer} value={vorm.project_eis_sleutel ?? ''} disabled={!magBeheren}
                    onChange={e => zet('project_eis_sleutel', e.target.value || null)}
                    placeholder="bijv. coating_rv" />
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <label style={veldLabel}>Meetmethode</label>
                <input style={invoer} value={vorm.meetmethode ?? ''} disabled={!magBeheren}
                  onChange={e => zet('meetmethode', e.target.value || null)} />
              </div>
              <p style={{ margin: '8px 0 0', ...zacht }}>
                Toetsing wordt straks: <strong>{eis.geen_waarde_bekend ? 'geen automatische toetsing (projecteis nodig)' : eisOmschrijving(eis)}</strong>
              </p>
            </fieldset>

            {/* Bron */}
            <fieldset style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
              <legend style={{ ...veldLabel, marginBottom: 0, padding: '0 6px' }}>Herkomst van de eis</legend>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                <div>
                  <label style={veldLabel}>Bron</label>
                  <select style={invoer} value={vorm.bron_type} disabled={!magBeheren}
                    onChange={e => zet('bron_type', e.target.value as KwaliteitBronType)}>
                    {Object.entries(kwaliteitBronTypeLabels).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={veldLabel}>Document</label>
                  <input style={invoer} value={vorm.bron_document ?? ''} disabled={!magBeheren}
                    onChange={e => zet('bron_document', e.target.value || null)} />
                </div>
                <div>
                  <label style={veldLabel}>Paragraaf</label>
                  <input style={invoer} value={vorm.bron_paragraaf ?? ''} disabled={!magBeheren}
                    onChange={e => zet('bron_paragraaf', e.target.value || null)} />
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <label style={veldLabel}>Eistekst (zichtbaar bij &ldquo;Technische eis bekijken&rdquo;)</label>
                <textarea style={{ ...invoer, minHeight: 54 }} value={vorm.eis_tekst ?? ''} disabled={!magBeheren}
                  onChange={e => zet('eis_tekst', e.target.value || null)} />
              </div>
            </fieldset>

            {/* Gedrag in de ronde */}
            <fieldset style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
              <legend style={{ ...veldLabel, marginBottom: 0, padding: '0 6px' }}>Gedrag tijdens de ronde</legend>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <Vink label="Foto verplicht bij afkeur" aan={vorm.foto_verplicht_bij_afkeur} disabled={!magBeheren}
                  onWissel={v => zet('foto_verplicht_bij_afkeur', v)} />
                <Vink label="Foto altijd verplicht" aan={vorm.foto_altijd_verplicht} disabled={!magBeheren}
                  onWissel={v => zet('foto_altijd_verplicht', v)} />
                <Vink label="Niet beoordeeld toestaan" aan={vorm.sta_niet_beoordeeld} disabled={!magBeheren}
                  onWissel={v => zet('sta_niet_beoordeeld', v)} />
                <Vink label="N.v.t. toestaan" aan={vorm.sta_nvt} disabled={!magBeheren}
                  onWissel={v => zet('sta_nvt', v)} />
                <Vink label="Nader onderzoek toestaan" aan={vorm.sta_nader_onderzoek} disabled={!magBeheren}
                  onWissel={v => zet('sta_nader_onderzoek', v)} />
                <Vink label="Actief" aan={vorm.actief} disabled={!magBeheren}
                  onWissel={v => zet('actief', v)} />
              </div>
            </fieldset>

            {/* Rapportteksten */}
            <fieldset style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
              <legend style={{ ...veldLabel, marginBottom: 0, padding: '0 6px' }}>Rapportteksten</legend>
              <div style={{ display: 'grid', gap: 10 }}>
                <div>
                  <label style={veldLabel}>Tekst bij voldoet</label>
                  <textarea style={{ ...invoer, minHeight: 48 }} value={vorm.rapport_tekst_voldoet ?? ''} disabled={!magBeheren}
                    onChange={e => zet('rapport_tekst_voldoet', e.target.value || null)} />
                </div>
                <div>
                  <label style={veldLabel}>Tekst bij voldoet niet</label>
                  <textarea style={{ ...invoer, minHeight: 60 }} value={vorm.rapport_tekst_voldoet_niet ?? ''} disabled={!magBeheren}
                    onChange={e => zet('rapport_tekst_voldoet_niet', e.target.value || null)} />
                </div>
                <div>
                  <label style={veldLabel}>Voorgestelde herstelactie</label>
                  <textarea style={{ ...invoer, minHeight: 48 }} value={vorm.standaard_herstelactie ?? ''} disabled={!magBeheren}
                    onChange={e => zet('standaard_herstelactie', e.target.value || null)} />
                </div>
              </div>
            </fieldset>

            {magBeheren && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setVorm(punt)}
                  disabled={!gewijzigd || bezig}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  Herstellen
                </button>
                <button
                  type="button"
                  onClick={() => void bewaar()}
                  disabled={!gewijzigd || bezig}
                  className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
                >
                  {bezig ? 'Opslaan…' : 'Opslaan'}
                </button>
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function Vink({
  label, aan, onWissel, disabled,
}: { label: string; aan: boolean; onWissel: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: disabled ? 'default' : 'pointer' }}>
      <input type="checkbox" checked={aan} disabled={disabled} onChange={e => onWissel(e.target.checked)} />
      {label}
    </label>
  )
}
