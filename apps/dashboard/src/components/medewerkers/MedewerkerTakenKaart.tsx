import { getActielijstenVoorMedewerker, getLosseTakenVoorMedewerker, getSjablonen } from '@/lib/taken/services/taken'
import { Card, CardBody } from '@/components/ui'
import ActiveerSjabloonDialog from '@/components/dossiers/ActiveerSjabloonDialog'
import { ActielijstenKaarten } from '@/components/dossiers/ActielijstenKaarten'
import DrainMedewerkerActiveringen from './DrainMedewerkerActiveringen'
import NieuweMedewerkerTaakKnop from './NieuweMedewerkerTaakKnop'

interface Props {
  medewerker_id: string
  medewerker_naam: string
}

/**
 * Taken & actielijsten van één medewerker — spiegel van de Taken-tab op een dossier.
 * Hergebruikt bewust dezelfde kaarten- en dialoogcomponenten, zodat beide contexten
 * er hetzelfde uitzien en één plek onderhouden hoeft te worden.
 */
export default async function MedewerkerTakenKaart({ medewerker_id, medewerker_naam }: Props) {
  const [lijsten, losseTaken, sjablonen] = await Promise.all([
    getActielijstenVoorMedewerker(medewerker_id),
    getLosseTakenVoorMedewerker(medewerker_id),
    getSjablonen('medewerker'),
  ])

  const medewerker = { id: medewerker_id, naam: medewerker_naam }

  return (
    <Card>
      <CardBody>
        {/* Defensief: verwerk openstaande activeringen door externe DB-writes (client, na mount). */}
        <DrainMedewerkerActiveringen medewerker_id={medewerker_id} />

        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--fg)' }}>Acties &amp; actielijsten</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--fg-muted)' }}>
              {lijsten.length === 0 && losseTaken.length === 0
                ? 'Nog geen acties aan deze medewerker gekoppeld.'
                : [
                    lijsten.length > 0 ? `${lijsten.length} actielijst${lijsten.length !== 1 ? 'en' : ''}` : null,
                    losseTaken.length > 0 ? `${losseTaken.length} losse ta${losseTaken.length !== 1 ? 'ken' : 'ak'}` : null,
                  ].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {sjablonen.length > 0 && (
              <ActiveerSjabloonDialog medewerker_id={medewerker_id} sjablonen={sjablonen} compact />
            )}
            <NieuweMedewerkerTaakKnop medewerker={medewerker} lijsten={lijsten} />
          </div>
        </div>

        <ActielijstenKaarten lijsten={lijsten} losseTaken={losseTaken} medewerker={medewerker} />
      </CardBody>
    </Card>
  )
}
