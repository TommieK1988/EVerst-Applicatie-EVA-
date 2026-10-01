import React from 'react'
import { createClient } from '@everts/database/server'
import WachtwoordForm from './WachtwoordForm'
import WachtwoordKader, { KaderUitleg, KaderFout } from './WachtwoordKader'

export const metadata = { title: 'Wachtwoord instellen · EVA' }

/**
 * Wachtwoord kiezen terwijl je al ingelogd bent (na een oude Supabase-link die via
 * /auth/callback een sessie zette). Nieuwe uitnodigingen en herstellinks lopen via
 * /auth/activeren en hebben deze pagina niet nodig. Zonder sessie: link verlopen.
 */
export default async function WachtwoordInstellenPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <WachtwoordKader titel="Wachtwoord instellen">
      {user ? (
        <>
          <KaderUitleg>
            Kies een wachtwoord voor <strong>{user.email}</strong>. Daarmee log je
            voortaan in op de app.
          </KaderUitleg>
          <WachtwoordForm />
        </>
      ) : (
        <KaderFout>
          Deze link is verlopen of ongeldig. Kies op het inlogscherm voor
          &lsquo;Wachtwoord vergeten&rsquo;, of vraag je beheerder om een nieuwe uitnodiging.
        </KaderFout>
      )}
    </WachtwoordKader>
  )
}
