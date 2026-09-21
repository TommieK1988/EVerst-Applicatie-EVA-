import { notFound } from 'next/navigation'
import { vereisCommercieelToegang } from '@/lib/commercie/mobiel-auth'
import { getContactpersoonBeeld } from '@/lib/commercie/contactpersoon-beeld'
import { leesToewijsbareMedewerkers } from '@/lib/commercie/toewijsbare-medewerkers'
import { getEffectieveRechten } from '@/lib/auth/rechten'
import { heeftModuleToegang } from '@/lib/auth/rechten-shared'
import AppHeader from '@/components/mobiel/AppHeader'
import MobielPullToRefresh from '@/components/mobiel/MobielPullToRefresh'
import ContactpersoonView from '@/components/mobiel/commercieel/ContactpersoonView'

export const metadata = { title: 'Contactpersoon · EVA Mobiel' }

export const dynamic = 'force-dynamic'

export default async function ContactpersoonPage(
  props: { params: Promise<{ contactpersoonId: string }> },
) {
  const { contactpersoonId } = await props.params
  const medewerker = await vereisCommercieelToegang('lezen', '/m')

  const [beeld, rechten, medewerkers] = await Promise.all([
    getContactpersoonBeeld(contactpersoonId),
    getEffectieveRechten(medewerker),
    leesToewijsbareMedewerkers(),
  ])

  if (!beeld) notFound()

  // De ondertitel is de werkgever, niet de functie: dat is wat een naam plaatst.
  const eerste = beeld.organisaties[0]
  const sub = eerste
    ? [eerste.functie, eerste.naam].filter(Boolean).join(' · ')
    : undefined

  return (
    <>
      {/* Terug naar het zoekscherm en niet naar de opdrachtgever: je komt hier vanuit een
          zoekopdracht op een naam, en de werkgever staat als eigen link in beeld. */}
      <AppHeader title={beeld.naam} sub={sub} backHref="/m/commercieel" />
      <MobielPullToRefresh />
      <ContactpersoonView
        beeld={beeld}
        currentMedewerkerId={medewerker.id}
        // Twee verschillende rechten, net als op het klantbeeld: een notitie hangt aan de
        // relatie, een verkoopkans is een rij in het dossier-domein.
        magSchrijven={heeftModuleToegang(rechten, 'relaties', 'schrijven')}
        magVerkoopkans={heeftModuleToegang(rechten, 'dossiers', 'schrijven')}
        medewerkers={medewerkers}
      />
    </>
  )
}
