'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@everts/database/client'
import { useRouter } from 'next/navigation'

export default function AuthCallbackPage() {
  const router = useRouter()
  const [fout, setFout] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    // Supabase uitnodigingslinks sturen tokens mee in het URL-fragment (#)
    const hash = window.location.hash.slice(1)
    const params = new URLSearchParams(hash)
    const access_token = params.get('access_token')
    const refresh_token = params.get('refresh_token')

    if (access_token && refresh_token) {
      supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
        if (error) {
          setFout(true)
        } else {
          router.push('/')
        }
      })
    } else {
      // Fallback: controleer of er al een sessie is (bijv. PKCE-flow)
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          router.push('/')
        } else {
          router.push('/login')
        }
      })
    }
  }, [router])

  if (fout) {
    return (
      <div style={{
        height: '100dvh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: 'sans-serif', gap: 12,
      }}>
        <p style={{ color: '#c0392b', margin: 0 }}>De uitnodigingslink is verlopen of ongeldig.</p>
        <a href="/login" style={{ color: '#009439', fontSize: 14 }}>Terug naar login</a>
      </div>
    )
  }

  return (
    <div style={{
      height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'sans-serif', color: '#555',
    }}>
      Bezig met inloggen…
    </div>
  )
}
