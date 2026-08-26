import React from 'react'
import Link from 'next/link'
import { getDossierKwaliteit, getOpenAfwijkingen } from '@/lib/kwaliteit/afwijkingen'
import { getInspecties } from '@/lib/kwaliteit/inspecties'
import { kwaliteitAfwijkingStatusLabels, kwaliteitErnstLabels } from '@everts/database/kwaliteit-types'
import KwaliteitRapportageKnop from '@/components/documenten/KwaliteitRapportageKnop'

/**
 * Het kwaliteitsblok op de dossiertab (§54).
 *
 * Bewust géén eigen dossiertab: dit hangt onder VCA, zodat de opdracht er niet nóg een tab bij
 * krijgt en alles wat met KAM te maken heeft op één plek staat. Toont wat de projectleider hier
 * nodig heeft — wanneer er voor het laatst is gelopen, wat er nog open staat, en wat er goed gaat.
 */
export default async function KwaliteitBlok({ dossierId }: { dossierId: string }) {
  const [samenvatting, open, inspecties] = await Promise.all([
    getDossierKwaliteit(dossierId),
    getOpenAfwijkingen(dossierId),
    getInspecties({ dossierId, limiet: 5 }),
  ])

  const kop = {
    fontSize: 14, fontWeight: 700, margin: '0 0 12px', color: 'var(--text-muted)',
    textTransform: 'uppercase' as const, letterSpacing: '0.05em',
  }
  const zacht = { fontSize: 13, color: 'var(--text-muted)' }

  if (samenvatting.aantalInspecties === 0) {
    return (
      <section style={{ marginBottom: 32 }}>
        <h3 style={kop}>Kwaliteitscontrole</h3>
        <p style={zacht}>
          Er is nog geen kwaliteitsronde uitgevoerd op deze opdracht. Een ronde start vanuit een
          actie in de actielijst waarop &ldquo;Kwaliteitsronde&rdquo; is aangevinkt.
        </p>
      </section>
    )
  }

  const totaalOpen = samenvatting.openKritiek + samenvatting.openTechnisch
    + samenvatting.openEsthetisch + samenvatting.openObservatie

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h3 style={{ ...kop, margin: 0 }}>Kwaliteitscontrole</h3>
        <KwaliteitRapportageKnop
          dossierId={dossierId}
          inspectieId={samenvatting.laatsteInspectie?.id}
          compact
        />
      </div>

      {/* Laatste ronde + verkeerslicht op hoe lang geleden dat was. */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 18, padding: '12px 14px', borderRadius: 10,
        border: '1px solid var(--border)', background: 'var(--bg-elev)', marginBottom: 14,
      }}>
        <Kolom label="Laatste ronde" waarde={
          samenvatting.laatsteInspectie
            ? new Date(samenvatting.laatsteInspectie.datum).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
            : '—'
        } sub={
          samenvatting.dagenSindsLaatste !== null
            ? `${samenvatting.dagenSindsLaatste} dagen geleden`
            : undefined
        } waarschuw={(samenvatting.dagenSindsLaatste ?? 0) > 21} />
        <Kolom label="Rondes" waarde={String(samenvatting.aantalInspecties)} />
        <Kolom label="Open kritiek" waarde={String(samenvatting.openKritiek)} waarschuw={samenvatting.openKritiek > 0} />
        <Kolom label="Open technisch" waarde={String(samenvatting.openTechnisch)} />
        <Kolom label="Open esthetisch" waarde={String(samenvatting.openEsthetisch)} />
        <Kolom label="Afgehandeld" waarde={String(samenvatting.afgerond)} />
      </div>

      {/* Openstaande afwijkingen. */}
      {totaalOpen > 0 && (
        <div style={{ marginBottom: 14 }}>
          <p style={{ ...zacht, margin: '0 0 8px', fontWeight: 600 }}>
            {totaalOpen} openstaande afwijking{totaalOpen === 1 ? '' : 'en'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {open.slice(0, 8).map(a => (
              <div key={a.id} style={{
                display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px',
                borderRadius: 8, border: '1px solid var(--border)',
              }}>
                <span style={{
                  padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                  background: a.ernst === 'kritiek' ? '#fee2e2' : a.ernst === 'technisch' ? '#fef9c3' : '#f3f4f6',
                  color: a.ernst === 'kritiek' ? '#dc2626' : a.ernst === 'technisch' ? '#854d0e' : '#6b7280',
                  whiteSpace: 'nowrap',
                }}>
                  {kwaliteitErnstLabels[a.ernst]}
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 600, minWidth: 96 }}>{a.afwijkingsnummer}</span>
                <span style={{
                  fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {a.omschrijving ?? a.controlepunt_code}
                </span>
                <span style={{ ...zacht, whiteSpace: 'nowrap' }}>{a.locatie ?? '—'}</span>
                <span style={{ ...zacht, whiteSpace: 'nowrap' }}>
                  {kwaliteitAfwijkingStatusLabels[a.status]}
                </span>
              </div>
            ))}
            {open.length > 8 && (
              <Link href="/kam/kwaliteit/afwijkingen" style={{ ...zacht, marginTop: 2 }}>
                Nog {open.length - 8} andere in het afwijkingenregister →
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Recente rondes. */}
      <div style={{ marginBottom: 14 }}>
        <p style={{ ...zacht, margin: '0 0 8px', fontWeight: 600 }}>Uitgevoerde rondes</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {inspecties.map(i => (
            <Link
              key={i.id}
              href={`/kam/kwaliteit/${i.id}`}
              style={{
                display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px',
                borderRadius: 8, border: '1px solid var(--border)', textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <span style={{ fontSize: 12.5, fontWeight: 600, minWidth: 110 }}>{i.inspectienummer}</span>
              <span style={{ ...zacht, minWidth: 100 }}>
                {new Date(i.datum).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              <span style={{ ...zacht, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {i.inspecteur ?? '—'}
              </span>
              <span style={zacht}>{i.aantal_beoordeeld} punten</span>
              <span style={{ ...zacht, fontWeight: i.aantal_afwijkingen > 0 ? 700 : 400 }}>
                {i.aantal_afwijkingen} afwijkingen
              </span>
              {i.status === 'concept' && (
                <span style={{
                  padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                  background: '#f3f4f6', color: '#6b7280',
                }}>
                  Concept
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>

      {/* Wat er goed gaat: het rapport toont dit ook, dus het hoort hier zichtbaar te zijn. */}
      {samenvatting.positieveFotos.length > 0 && (
        <div>
          <p style={{ ...zacht, margin: '0 0 8px', fontWeight: 600 }}>Recente positieve waarnemingen</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {samenvatting.positieveFotos.slice(0, 8).map(f => (
              <a key={f.url} href={f.url} target="_blank" rel="noreferrer" title={f.omschrijving ?? ''}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt="" style={{
                  width: 76, height: 76, objectFit: 'cover', borderRadius: 8,
                  border: '1px solid var(--border)',
                }} />
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function Kolom({
  label, waarde, sub, waarschuw,
}: { label: string; waarde: string; sub?: string; waarschuw?: boolean }) {
  return (
    <div>
      <div style={{
        fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
        color: 'var(--text-muted)',
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 18, fontWeight: 700, lineHeight: 1.2,
        color: waarschuw ? '#dc2626' : 'var(--text)',
      }}>
        {waarde}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  )
}
