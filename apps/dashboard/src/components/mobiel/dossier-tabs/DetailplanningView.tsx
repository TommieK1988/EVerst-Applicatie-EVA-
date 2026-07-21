import React from 'react'
import { createAdminClient } from '@everts/database/server'
import { format, parseISO } from 'date-fns'
import { nl } from 'date-fns/locale'

/**
 * Mobiele Detailplanning-tab: compacte lijst van planning-activiteiten van het
 * dossier (EVA-native, geen Bouw7). Toont per activiteit de gewenste start/deadline,
 * status, locatie en toegewezen mensen — niet de desktop-Gantt.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

const STATUS_KLEUR: Record<string, string> = {
  concept: '#9aa4ab', gepland: '#009439', in_uitvoering: '#009439',
  gereed: '#6b757c', geannuleerd: '#b42318',
}

function datumLabel(iso: string | null): string | null {
  if (!iso) return null
  try { return format(parseISO(iso), 'd MMM', { locale: nl }) } catch { return null }
}

export default async function DetailplanningView({ dossierId }: { dossierId: string }) {
  const supabase = db()
  const { data } = await supabase
    .from('planning_activiteiten')
    .select(`
      id, titel, status, gewenste_start, deadline, locatie_adres, volgorde,
      planning_items ( medewerkers ( voornaam, achternaam ) )
    `)
    .eq('dossier_id', dossierId)
    .order('volgorde', { ascending: true })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activiteiten = (data ?? []) as any[]

  if (activiteiten.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: '#6b757c', padding: '40px 16px', fontSize: 14 }}>
        Geen planning voor dit dossier.
      </div>
    )
  }

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {activiteiten.map((a: any) => {
        const kleur = STATUS_KLEUR[a.status as string] ?? '#9aa4ab'
        const periode = [datumLabel(a.gewenste_start), datumLabel(a.deadline)].filter(Boolean).join(' – ')
        const mensen = Array.from(new Set(
          (a.planning_items ?? [])
            .map((pi: any) => pi.medewerkers?.voornaam)
            .filter(Boolean)
        )).join(', ')

        return (
          <div key={a.id} style={{
            padding: '12px 14px', background: '#fff',
            border: '1px solid #e3e8ea', borderRadius: 12,
            borderLeft: `4px solid ${kleur}`,
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#161b20' }}>{a.titel}</div>
            <div style={{ fontSize: 12, color: '#6b757c', marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {periode && <span>📅 {periode}</span>}
              {mensen && <span>👤 {mensen}</span>}
            </div>
            {a.locatie_adres && (
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(a.locatie_adres)}`}
                target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: '#009439', textDecoration: 'none', marginTop: 4, display: 'inline-block' }}
              >
                📍 {a.locatie_adres}
              </a>
            )}
          </div>
        )
      })}
    </div>
  )
}
