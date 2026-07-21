'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getProjects } from '@/services/houtrotherstel/projects'
import type { ProjectWithStats } from '@/lib/houtrotherstel/types'
import AppHeader from '@/components/mobiel/AppHeader'
import MobielStickyFooter from '@/components/mobiel/MobielStickyFooter'

/**
 * Mobiel Houtrot-scherm (buitendienst): lijst van houtrot-projecten uit de echte
 * `houtrotherstel`-tabellen (client-side via de schema-scoped service). Client
 * component omdat de houtrot-services de browser-client gebruiken.
 *
 * Nog te bouwen (aparte stap): registratie invullen op locatie met foto's.
 */
const STATUS_LABEL: Record<string, { label: string; kleur: string }> = {
  concept: { label: 'Concept', kleur: '#9aa4ab' },
  actief: { label: 'Actief', kleur: '#009439' },
  afgerond: { label: 'Afgerond', kleur: '#6b757c' },
  gepauzeerd: { label: 'Gepauzeerd', kleur: '#b98900' },
  geannuleerd: { label: 'Geannuleerd', kleur: '#b42318' },
}

export default function MobielHoutrotPage() {
  const [projecten, setProjecten] = useState<ProjectWithStats[] | null>(null)
  const [fout, setFout] = useState<string | null>(null)

  useEffect(() => {
    getProjects()
      .then(setProjecten)
      .catch((e) => setFout(e instanceof Error ? e.message : 'Laden mislukt'))
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <AppHeader title="Houtrot" sub="Projecten" backHref="/m" />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {fout && (
          <div style={{ color: '#b42318', fontSize: 14, textAlign: 'center', padding: 24 }}>{fout}</div>
        )}
        {!fout && projecten === null && (
          <div style={{ color: '#6b757c', fontSize: 14, textAlign: 'center', padding: 24 }}>Laden…</div>
        )}
        {!fout && projecten?.length === 0 && (
          <div style={{ color: '#6b757c', fontSize: 14, textAlign: 'center', padding: 24 }}>Geen projecten.</div>
        )}
        {projecten?.map((p) => {
          const st = STATUS_LABEL[p.status] ?? { label: p.status, kleur: '#9aa4ab' }
          return (
            <Link
              key={p.id}
              href={`/m/houtrot/nieuw?project=${p.id}`}
              style={{
                display: 'block', textDecoration: 'none',
                padding: '14px 16px', background: '#fff',
                border: '1px solid #e3e8ea', borderRadius: 12,
                borderLeft: `4px solid ${st.kleur}`,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#161b20', minWidth: 0 }}>{p.name}</div>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: st.kleur, flexShrink: 0 }}>
                  {st.label}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#6b757c', marginTop: 3 }}>
                {[p.client_name, p.city].filter(Boolean).join(' · ')}
                {p.project_number ? ` · #${p.project_number}` : ''}
              </div>
            </Link>
          )
        })}
      </div>

      <MobielStickyFooter>
        <Link
          href="/m/houtrot/nieuw"
          style={{
            display: 'block', width: '100%', textAlign: 'center',
            padding: '14px 16px', borderRadius: 12,
            background: '#009439', color: '#fff',
            fontSize: 16, fontWeight: 700, textDecoration: 'none',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          Nieuwe registratie
        </Link>
      </MobielStickyFooter>
    </div>
  )
}
