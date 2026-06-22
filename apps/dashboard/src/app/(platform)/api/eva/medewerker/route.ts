import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@everts/database/server'
import { getMedewerkerProfiel } from '@/lib/search/global'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Profiel van één medewerker (inline paneel in de snelzoeker). Alleen ingelogde gebruikers. */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id ontbreekt' }, { status: 400 })

  try {
    const profiel = await getMedewerkerProfiel(id)
    if (!profiel) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
    return NextResponse.json(profiel)
  } catch (err) {
    console.error('Medewerker-profiel fout:', err)
    return NextResponse.json({ error: 'Ophalen mislukt' }, { status: 500 })
  }
}
