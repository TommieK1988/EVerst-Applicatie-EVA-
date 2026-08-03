import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@everts/database/server'
import type {
  Relatie,
  RelatieFactuuradres,
  RelatieBankgegevens,
  RelatieFacturatie,
  RelatieInkoop,
  RelatieVerkoopPrijsafspraak,
  RelatieInkoopKortingsafspraak,
  RelatieInkoopPrijsafspraak,
  OmzetData,
} from '@everts/database'
import { getContactpersonenVoorOrganisatie } from '@/lib/relaties/contactpersonen-actions'
import { getOmzetVoorRelatie } from '@/lib/relaties/actions'
import { getRelatieObjecten } from '@/lib/objecten/data'
import RelatieDetailView from './RelatieDetailView'

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const params = await props.params
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('relaties').select('naam').eq('id', params.id).maybeSingle()
  return { title: data?.naam ?? 'Relatie' }
}

export default async function RelatieDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const supabase = createAdminClient() as any

  const [
    relatieRes,
    factuuradressen,
    bankgegevens,
    facturatie,
    inkoop,
    verkoopPrijsafspraken,
    kortingsafspraken,
    inkoopPrijsafspraken,
    contactpersonen,
    omzet,
    objecten,
  ] = await Promise.all([
    supabase.from('relaties').select('*').eq('id', params.id).maybeSingle(),
    supabase.from('relatie_factuuradressen').select('*').eq('relatie_id', params.id).order('label'),
    supabase.from('relatie_bankgegevens').select('*').eq('relatie_id', params.id).maybeSingle(),
    supabase.from('relatie_facturatie').select('*').eq('relatie_id', params.id).maybeSingle(),
    supabase.from('relatie_inkoop').select('*').eq('relatie_id', params.id).maybeSingle(),
    supabase.from('relatie_verkoop_prijsafspraken').select('*').eq('relatie_id', params.id).order('omschrijving'),
    supabase.from('relatie_inkoop_kortingsafspraken').select('*').eq('relatie_id', params.id).order('categorie'),
    supabase.from('relatie_inkoop_prijsafspraken').select('*').eq('relatie_id', params.id).order('omschrijving'),
    getContactpersonenVoorOrganisatie(params.id),
    getOmzetVoorRelatie(params.id),
    getRelatieObjecten(params.id),
  ])

  if (!relatieRes.data) notFound()

  return (
    <RelatieDetailView
      relatie={relatieRes.data as Relatie}
      factuuradressen={(factuuradressen.data ?? []) as RelatieFactuuradres[]}
      bankgegevens={bankgegevens.data as RelatieBankgegevens | null}
      facturatie={facturatie.data as RelatieFacturatie | null}
      inkoop={inkoop.data as RelatieInkoop | null}
      verkoopPrijsafspraken={(verkoopPrijsafspraken.data ?? []) as RelatieVerkoopPrijsafspraak[]}
      kortingsafspraken={(kortingsafspraken.data ?? []) as RelatieInkoopKortingsafspraak[]}
      inkoopPrijsafspraken={(inkoopPrijsafspraken.data ?? []) as RelatieInkoopPrijsafspraak[]}
      contactpersonen={contactpersonen}
      omzet={omzet as OmzetData}
      objecten={objecten}
    />
  )
}
