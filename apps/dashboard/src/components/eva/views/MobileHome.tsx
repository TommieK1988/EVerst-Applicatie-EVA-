'use client'
import React from 'react'
import Link from 'next/link'
import { IconSjablonen, IconFormulieren } from '../Icons'
import { format, parseISO, isPast, isToday } from 'date-fns'
import { nl } from 'date-fns/locale'

export type MobileTaak = {
  id: string
  titel: string
  deadline: string | null
  dossier_id: string | null
  dossier_sectie: string | null
  dossier_naam: string | null
}

export type MobileFormTaak = {
  id: string
  template_id: string
  naam: string
  deadline: string | null
  dossier_id: string | null
}

type Props = {
  voornaam: string
  taken: MobileTaak[]
  formTaken: MobileFormTaak[]
}

function deadlineLabel(iso: string | null): { tekst: string; kleur: string } | null {
  if (!iso) return null
  try {
    const d = parseISO(iso)
    const kleur = isPast(d) && !isToday(d) ? 'var(--error-700)' : isToday(d) ? 'var(--warning-700)' : 'var(--fg-muted)'
    return { tekst: format(d, 'd MMM', { locale: nl }), kleur }
  } catch {
    return null
  }
}

function taakHref(t: MobileTaak): string {
  if (t.dossier_id && t.dossier_sectie) return `/${t.dossier_sectie}/${t.dossier_id}/taken`
  return '/taken/overzicht'
}

export default function MobileHome({ voornaam, taken, formTaken }: Props) {
  return (
    <div style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>
        Hoi {voornaam}
      </h1>

      {/* Snelkoppelingen */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Tile href="/taken/overzicht" label="Taken" Icon={IconSjablonen} aantal={taken.length} />
        <Tile href="/formulieren/overzicht" label="Formulieren" Icon={IconFormulieren} aantal={formTaken.length} />
      </div>

      {/* Mijn taken */}
      <Sectie titel="Mijn taken" href="/taken/overzicht" leeg="Geen openstaande taken">
        {taken.slice(0, 6).map(t => {
          const dl = deadlineLabel(t.deadline)
          return (
            <Link key={t.id} href={taakHref(t)} style={rowStyle()}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.titel}
                </div>
                {t.dossier_naam && (
                  <div style={{ fontSize: 12, color: 'var(--fg-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.dossier_naam}
                  </div>
                )}
              </div>
              {dl && <span style={{ fontSize: 12, fontWeight: 600, color: dl.kleur, flexShrink: 0 }}>{dl.tekst}</span>}
            </Link>
          )
        })}
      </Sectie>

      {/* Openstaande formulieren */}
      <Sectie titel="Openstaande formulieren" href="/formulieren/overzicht" leeg="Geen openstaande formulieren">
        {formTaken.slice(0, 6).map(f => {
          const dl = deadlineLabel(f.deadline)
          const href = `/formulieren/${f.template_id}/invullen${f.dossier_id ? `?dossier_id=${f.dossier_id}` : ''}`
          return (
            <Link key={f.id} href={href} style={rowStyle()}>
              <div style={{ minWidth: 0, flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.naam}
              </div>
              {dl && <span style={{ fontSize: 12, fontWeight: 600, color: dl.kleur, flexShrink: 0 }}>{dl.tekst}</span>}
            </Link>
          )
        })}
      </Sectie>
    </div>
  )
}

function Tile({ href, label, Icon, aantal }: {
  href: string; label: string; Icon: React.ComponentType<{ size?: number }>; aantal: number
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'flex', flexDirection: 'column', gap: 8,
        padding: 16, borderRadius: 12, textDecoration: 'none',
        border: '1px solid var(--border)', background: 'var(--surface, #fff)',
        color: 'var(--fg)', minHeight: 96, justifyContent: 'space-between',
      }}
    >
      <span style={{ color: 'var(--brand-600)' }}><Icon size={24} /></span>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{aantal} open</div>
      </div>
    </Link>
  )
}

function Sectie({ titel, href, leeg, children }: {
  titel: string; href: string; leeg: string; children: React.ReactNode
}) {
  const items = React.Children.toArray(children)
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
          {titel}
        </h2>
        <Link href={href} style={{ fontSize: 13, color: 'var(--brand-600)', textDecoration: 'none', fontWeight: 600 }}>
          Alles
        </Link>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.length > 0
          ? items
          : <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: 0, padding: '12px 0' }}>{leeg}</p>}
      </div>
    </section>
  )
}

function rowStyle(): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 10,
    minHeight: 'var(--touch-target)', padding: '10px 12px',
    border: '1px solid var(--border)', borderRadius: 10,
    background: 'var(--surface, #fff)', textDecoration: 'none',
  }
}
