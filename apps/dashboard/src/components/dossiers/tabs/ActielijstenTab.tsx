import { getActielijstenVoorDossier, getLosseTakenVoorDossier, getSjablonen } from '@/lib/taken/services/taken'
import ActiveerSjabloonDialog from '../ActiveerSjabloonDialog'
import { ActielijstenKaarten } from '../ActielijstenKaarten'
import DrainActiveringen from '../DrainActiveringen'
import NieuweDossierTaakKnop from '../NieuweDossierTaakKnop'

interface Props {
  dossier_id: string
  dossier_titel?: string
}

export default async function ActielijstenTab({ dossier_id, dossier_titel }: Props) {
  const [lijsten, losseTaken, sjablonen] = await Promise.all([
    getActielijstenVoorDossier(dossier_id),
    getLosseTakenVoorDossier(dossier_id),
    // Alleen dossier-sjablonen: medewerker-sjablonen horen op de medewerkerpagina.
    getSjablonen('dossier'),
  ])

  const dossier = { id: dossier_id, titel: dossier_titel ?? 'Dit dossier' }

  return (
    <div style={{ padding: '32px 40px', maxWidth: 860 }}>
      {/* Defensief: verwerk openstaande activeringen door externe DB-writes (client, na mount). */}
      <DrainActiveringen dossier_id={dossier_id} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>Acties</h2>
          <p style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 4 }}>
            {lijsten.length === 0 && losseTaken.length === 0
              ? 'Nog geen acties aan dit dossier gekoppeld.'
              : [
                  lijsten.length > 0 ? `${lijsten.length} actielijst${lijsten.length !== 1 ? 'en' : ''}` : null,
                  losseTaken.length > 0 ? `${losseTaken.length} losse ta${losseTaken.length !== 1 ? 'ken' : 'ak'}` : null,
                ].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {sjablonen.length > 0 && (
            <ActiveerSjabloonDialog dossier_id={dossier_id} sjablonen={sjablonen} />
          )}
          <NieuweDossierTaakKnop dossier={dossier} lijsten={lijsten} />
        </div>
      </div>

      <ActielijstenKaarten lijsten={lijsten} losseTaken={losseTaken} dossier={dossier} />
    </div>
  )
}
