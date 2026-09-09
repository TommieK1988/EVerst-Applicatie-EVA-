import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@everts/database/server'

import { vereisRecht } from '@/lib/auth/rechten'
import { getAanvraagCategorieen } from '@/lib/dossiers/actions'
import { getBerichtDetail } from '@/lib/mailintake/data'
import { zoekObjectBijAdres } from '@/lib/mailintake/objecten'

import BerichtBehandelen from './BerichtBehandelen'

export const metadata: Metadata = { title: 'Bericht behandelen' }
export const dynamic = 'force-dynamic'

export default async function BerichtPage({ params }: { params: Promise<{ id: string }> }) {
  const { rechten } = await vereisRecht('mailintake', 'lezen')
  const { id } = await params

  const detail = await getBerichtDetail(id)
  if (!detail) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const [{ data: werkmaatschappijen }, categorieen] = await Promise.all([
    supabase.from('bedrijfsgegevens').select('id, naam').eq('type', 'werkmaatschappij').order('naam').limit(50),
    getAanvraagCategorieen(),
  ])

  // De objectkandidaten worden niet opgeslagen maar hier opnieuw bepaald: de
  // gebruiker kan het adres in het formulier nog wijzigen, en dan zou een
  // bevroren lijst juist de verkeerde alternatieven tonen.
  const v = (detail.extractie?.velden ?? {}) as Record<string, string | null>
  const objectTreffer = await zoekObjectBijAdres({
    straat: v.werkadres_straat ?? null,
    huisnummer: v.werkadres_huisnummer ?? null,
    postcode: v.werkadres_postcode ?? null,
    stad: v.werkadres_stad ?? null,
    vveCode: v.vve_code ?? null,
    relatieId: (detail.bericht as any).relatie?.id ?? null,
  }).catch(() => null)

  return (
    <BerichtBehandelen
      detail={JSON.parse(JSON.stringify(detail))}
      objectTreffer={objectTreffer ? JSON.parse(JSON.stringify(objectTreffer)) : null}
      werkmaatschappijen={werkmaatschappijen ?? []}
      categorieen={categorieen}
      magSchrijven={rechten.mailintake === 'schrijven' || rechten.mailintake === 'beheren'}
    />
  )
}
