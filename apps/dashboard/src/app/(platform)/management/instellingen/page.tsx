import type { Metadata } from 'next'
import { createClient } from '@everts/database/server'
import InstellingenForm from './InstellingenForm'

export const metadata: Metadata = { title: 'Management Instellingen' }

export default async function InstellingenPage() {
  const supabase = await createClient()
  const huidigJaar = new Date().getFullYear()

  const [{ data: akData }, { data: doelstellingen }, { data: projecten }] = await Promise.all([
    supabase
      .from('management_ak')
      .select('*')
      .eq('jaar', huidigJaar)
      .order('filiaal'),
    supabase
      .from('management_doelstellingen')
      .select('*')
      .eq('jaar', huidigJaar)
      .order('filiaal', { ascending: true }),
    supabase
      .from('management_projecten')
      .select('filiaal, projectleider')
      .order('filiaal'),
  ])

  // Unieke filialen en projectleiders
  const filialen = [...new Set(
    (projecten ?? []).map(p => p.filiaal).filter(Boolean) as string[]
  )].sort()

  const projectleiders = [...new Set(
    (projecten ?? []).map(p => p.projectleider).filter(Boolean) as string[]
  )].sort()

  return (
    <InstellingenForm
      huidigJaar={huidigJaar}
      filialen={filialen}
      projectleiders={projectleiders}
      akData={akData ?? []}
      doelstellingen={doelstellingen ?? []}
    />
  )
}
