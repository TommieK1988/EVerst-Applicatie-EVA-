import type { Metadata } from 'next'
import { Suspense } from 'react'
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
import { getRelatieNotities } from '@/lib/relaties/notities-actions'
import { getCurrentMedewerker, getEffectieveRechten } from '@/lib/auth/rechten'
import { heeftModuleToegang } from '@/lib/auth/rechten-shared'
import { getRelatieObjecten } from '@/lib/objecten/data'
import RelatieDetailView from './RelatieDetailView'
import AcquisitieBlok from './AcquisitieBlok'
import GekoppeldeDossiersSectie, { GekoppeldeDossiersSkelet } from './GekoppeldeDossiersSectie'

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
    notities,
    medewerker,
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
    // Niet gestreamd zoals de dossiers: dit is één geïndexeerde query op een kleine tabel
    // (`relatie_notities_relatie_created_idx`), en het blok staat boven de vouw.
    getRelatieNotities(params.id),
    getCurrentMedewerker().catch(() => null),
  ])

  if (!relatieRes.data) notFound()

  // Het Acquisitie-blok laat de invoer weg zonder schrijfrecht; alleen-lezen is nuttiger dan
  // een formulier dat bij opslaan een foutmelding geeft.
  const rechten = medewerker ? await getEffectieveRechten(medewerker) : {}
  const magNotitieSchrijven = heeftModuleToegang(rechten, 'relaties', 'schrijven')

  // De kiezer wil een naam, niet de koppelrij. Inactieve contactpersonen vallen af: je legt
  // geen nieuw gesprek vast met iemand die uit dienst is.
  const contactpersoonKeuzes = contactpersonen
    .filter(k => k.contactpersoon?.actief !== false)
    .map(k => ({
      id: k.contactpersoon.id,
      naam: [k.contactpersoon.voornaam, k.contactpersoon.tussenvoegsel, k.contactpersoon.achternaam]
        .filter(Boolean).join(' ').trim() || 'Naamloos',
    }))

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
      acquisitie={
        <AcquisitieBlok
          relatieId={params.id}
          notities={notities}
          contactpersonen={contactpersoonKeuzes}
          currentMedewerkerId={medewerker?.id ?? null}
          magSchrijven={magNotitieSchrijven}
        />
      }
      dossiers={
        // Gestreamd: de dossierquery's (inclusief inkoopfacturen) zijn zwaarder dan de rest
        // van de pagina, en de relatiekaart hoort daar niet op te wachten.
        <Suspense fallback={<GekoppeldeDossiersSkelet />}>
          <GekoppeldeDossiersSectie relatieId={params.id} />
        </Suspense>
      }
    />
  )
}
