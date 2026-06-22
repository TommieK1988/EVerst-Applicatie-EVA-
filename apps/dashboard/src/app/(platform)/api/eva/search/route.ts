import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@everts/database/server'
import { searchAllEntities } from '@/lib/search/global'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Federatieve term-zoek voor de globale snelzoeker (⌘K). Alleen ingelogde gebruikers. */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 })

  const q = request.nextUrl.searchParams.get('q') ?? ''
  try {
    const results = await searchAllEntities(q)
    return NextResponse.json(results)
  } catch (err) {
    console.error('EVA-zoek fout:', err)
    return NextResponse.json({ error: 'Zoeken mislukt' }, { status: 500 })
  }
}
