/**
 * Serverkant van het blok Gekoppelde dossiers.
 *
 * Apart component zodat de relatiepagina hem achter een `<Suspense>` kan hangen: de
 * dossierquery's zijn zwaarder dan de rest van de pagina, en de relatiekaart hoort niet op de
 * inkoopfacturen te wachten. Zelfde redenering als de gestreamde tabs in het dossier.
 */
import { createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import { getRelatieDossiers } from '@/lib/relaties/dossiers'
import { Card, CardBody, CardHeader, Skeleton } from '@/components/ui'
import GekoppeldeDossiersBlok from '@/components/relaties/GekoppeldeDossiersBlok'

export function GekoppeldeDossiersSkelet() {
  return (
    <Card>
      <CardHeader><span>Gekoppelde dossiers</span></CardHeader>
      <CardBody>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} style={{ height: 28 }} />)}
        </div>
      </CardBody>
    </Card>
  )
}

export default async function GekoppeldeDossiersSectie({ relatieId }: { relatieId: string }) {
  let user_id: string | null = null
  try {
    const sessionClient = await createServerClient()
    const { data: { user } } = await sessionClient.auth.getUser()
    user_id = user?.id ?? null
  } catch {
    // Niet ingelogd of sessie niet beschikbaar — de tabellen vallen terug op de standaardkolommen.
  }

  const [data, klantLayouts, inkoopLayouts] = await Promise.all([
    getRelatieDossiers(relatieId),
    user_id ? laadLayouts(user_id, 'relatie-dossiers') : [],
    user_id ? laadLayouts(user_id, 'relatie-inkoopdossiers') : [],
  ])

  return (
    <GekoppeldeDossiersBlok
      data={data}
      layouts={{ klant: klantLayouts, inkoop: inkoopLayouts }}
      user_id={user_id}
    />
  )
}
