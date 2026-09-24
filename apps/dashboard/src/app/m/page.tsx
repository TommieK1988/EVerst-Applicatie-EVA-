import { createClient, createAdminClient } from '@everts/database/server'
import { telMijnOpenTaken } from '@/lib/taken/services/taken'
import { getCurrentMedewerker, getEffectieveRechten } from '@/lib/auth/rechten'
import { heeftModuleToegang } from '@/lib/auth/rechten-shared'
import { FEATURES } from '@/lib/features'
import { magPrikklok as prikklokToegang } from '@/lib/prikklok/auth'
import { haalVandaag, haalHomeSignalen } from '@/lib/mobiel/home'
import MobielHome from '@/components/mobiel/MobielHome'

export const metadata = { title: 'EVA Mobiel' }

/**
 * De planning van vandaag en de openstaande weekstaten horen bij het moment, niet
 * bij de build: zonder dit zou de startpagina een dag later nog de agenda van
 * gisteren tonen.
 */
export const dynamic = 'force-dynamic'

/** Alleen tellen, geen rijen: dit is het eerste scherm dat laadt. */
async function telOngelezenMeldingen(userId: string): Promise<number> {
  try {
    const { count } = await createAdminClient()
      .from('notificaties')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('gelezen', false)
    return count ?? 0
  } catch {
    return 0
  }
}

export default async function MobielHomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [openTaken, medewerker, ongelezenMeldingen] = await Promise.all([
    user ? telMijnOpenTaken(user.id).catch(() => 0) : Promise.resolve(0),
    getCurrentMedewerker().catch(() => null),
    user ? telOngelezenMeldingen(user.id) : Promise.resolve(0),
  ])

  // Wie de Materieel-tegel ziet, bepaalt het recht `materieelbeheer` (niveau
  // 'lezen'). Toevoegen vraagt 'schrijven'; dat checkt het scherm zelf, zodat
  // iemand die alleen mag kijken de tegel wél houdt.
  const rechten = medewerker ? await getEffectieveRechten(medewerker) : {}
  const magMaterieel =
    FEATURES.materieelbeheer && heeftModuleToegang(rechten, 'materieelbeheer', 'lezen')

  // Commercieel hangt aan het bestaande recht `relaties` (lezen). Zie
  // `lib/commercie/mobiel-auth.ts` voor waarom dat geen eigen recht is geworden: het scherm
  // toont niets wat niet ook op de relatiepagina staat, en `relaties` dekt vandaag precies
  // de groep die opdrachtgevers spreekt.
  const magCommercieel = heeftModuleToegang(rechten, 'relaties', 'lezen')

  // Het handboek staat bewust NIET op een recht: iedereen met een account mag
  // zijn eigen handboek lezen, en wát hij ziet bepalen de zichtbaarheids-
  // kenmerken in de database. Alleen de feature-flag verbergt de tegel zolang
  // de module nog niet live is.
  const magHandboek = FEATURES.handboek && !!medewerker

  // De prikklok staat in de testfase: alleen wie op de testerlijst staat ziet de tegel. Geen
  // recht, want beheerders passeren elk recht — zie lib/prikklok/auth.ts.
  const magPrikklok = await prikklokToegang(medewerker?.id)

  // Beide fail-soft: valt de agenda of de weekstaat-lees om, dan blijft de
  // launcher gewoon werken. De tegels zijn het minimum dat dit scherm moet doen.
  const [vandaag, signalen] = medewerker
    ? await Promise.all([
        haalVandaag(medewerker).catch(() => null),
        haalHomeSignalen(medewerker.id).catch(() => null),
      ])
    : [null, null]

  return (
    <MobielHome
      naam={medewerker?.voornaam ?? null}
      openTaken={openTaken}
      ongelezenMeldingen={ongelezenMeldingen}
      magMaterieel={magMaterieel}
      magHandboek={magHandboek}
      magCommercieel={magCommercieel}
      magPrikklok={magPrikklok}
      vandaag={vandaag}
      signalen={signalen}
    />
  )
}
