import React from 'react'
import { controleerActivatielink } from '@/lib/auth/activatielink'
import WachtwoordForm from '@/app/wachtwoord-instellen/WachtwoordForm'
import WachtwoordKader, { KaderUitleg, KaderFout } from '@/app/wachtwoord-instellen/WachtwoordKader'

export const metadata = { title: 'Wachtwoord kiezen · EVA' }
export const dynamic = 'force-dynamic'

const FOUT = {
  onbekend: 'Deze link klopt niet. Open de knop in je mail opnieuw, of kies op het inlogscherm Wachtwoord vergeten.',
  gebruikt: 'Met deze link is al een wachtwoord gekozen. Log in met dat wachtwoord, of kies op het inlogscherm Wachtwoord vergeten.',
  verlopen: 'Deze link is verlopen. Kies op het inlogscherm Wachtwoord vergeten, dan krijg je een nieuwe.',
} as const

/**
 * Landingspagina van de activatie- en herstellink (zie lib/auth/activatielink.ts).
 *
 * Openen verbruikt niets — dat is de kern. Mail-scanners en previews openen deze pagina ook,
 * en mogen daarmee de link niet onbruikbaar maken. Pas het formulier zet het wachtwoord.
 * Publiek bereikbaar via het /auth/-voorvoegsel in de middleware.
 */
export default async function ActiverenPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams
  const link = await controleerActivatielink(t)

  return (
    <WachtwoordKader titel={link.geldig && link.doel === 'herstel' ? 'Nieuw wachtwoord' : 'Welkom bij EVA'}>
      {link.geldig ? (
        <>
          <KaderUitleg>
            Kies een wachtwoord voor <strong>{link.email}</strong>. Daarmee log je
            voortaan in op de app.
          </KaderUitleg>
          <WachtwoordForm token={t} />
        </>
      ) : (
        <>
          <KaderFout>{FOUT[link.reden]}</KaderFout>
          <a href="/login" style={{
            display: 'block', marginTop: 16, textAlign: 'center', padding: '14px 20px',
            borderRadius: 12, background: '#009439', color: '#fff', fontWeight: 700,
            fontSize: 15, textDecoration: 'none',
          }}>Naar het inlogscherm</a>
        </>
      )}
    </WachtwoordKader>
  )
}
