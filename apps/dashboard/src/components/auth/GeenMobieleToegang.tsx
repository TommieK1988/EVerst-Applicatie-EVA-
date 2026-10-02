'use client'

import React from 'react'
import { logout } from '@/app/(auth)/login/actions'

/**
 * Vangnet voor de mobiele omgeving: er is wél een Supabase-sessie, maar geen
 * geldig (actief, niet-'geen') medewerker-record. Dat kan alleen als een sessie
 * de medewerker-poort omzeilde. We loggen direct uit — een kale redirect naar
 * /login zou lussen (middleware stuurt een ingelogde gebruiker terug naar /m).
 */
export default function GeenMobieleToegang({ tekst }: {
  /**
   * De melding, al vertaald door de layout. Deze tak staat búíten de taalprovider van
   * `/m` (er is geen geldige medewerker om de app voor op te zetten), dus de tekst
   * komt als prop mee in plaats van via `useTranslations`.
   */
  tekst: string
}) {
  React.useEffect(() => {
    logout().catch(() => { window.location.href = '/login' })
  }, [])

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100dvh', padding: 24, textAlign: 'center',
      fontFamily: "'Montserrat', ui-sans-serif, system-ui, sans-serif",
      color: '#6b757c', fontSize: 14,
    }}>
      {tekst}
    </div>
  )
}
