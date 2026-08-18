import { createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import { getActieRijenVoorDossier, getActielijstenVoorDossier, getSjablonen } from '@/lib/taken/services/taken'
import ActiveerSjabloonDialog from '../ActiveerSjabloonDialog'
import ActiesTabel from '../ActiesTabel'
import DrainActiveringen from '../DrainActiveringen'
import NieuweDossierTaakKnop from '../NieuweDossierTaakKnop'

interface Props {
  dossier_id: string
  dossier_titel?: string
}

export default async function ActielijstenTab({ dossier_id, dossier_titel }: Props) {
  let user_id: string | null = null
  try {
    const sessionClient = await createServerClient()
    const { data: { user } } = await sessionClient.auth.getUser()
    user_id = user?.id ?? null
  } catch {
    // niet ingelogd of sessie niet beschikbaar
  }

  const [rijen, lijsten, sjablonen, layouts] = await Promise.all([
    getActieRijenVoorDossier(dossier_id),
    // Alleen voor de keuzelijst "actielijst" in het nieuwe-actie-venster.
    getActielijstenVoorDossier(dossier_id),
    // Alleen dossier-sjablonen: medewerker-sjablonen horen op de medewerkerpagina.
    getSjablonen('dossier'),
    user_id ? laadLayouts(user_id, 'dossier-acties') : [],
  ])

  const dossier = { id: dossier_id, titel: dossier_titel ?? 'Dit dossier' }
  const gereed = rijen.filter(r => r.status === 'gereed').length

  return (
    <div style={{ padding: '32px 40px' }}>
      {/* Defensief: verwerk openstaande activeringen door externe DB-writes (client, na mount). */}
      <DrainActiveringen dossier_id={dossier_id} />
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>Acties</h2>
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 4 }}>
          {rijen.length === 0
            ? 'Nog geen acties aan dit dossier gekoppeld.'
            : `${rijen.length} actie${rijen.length !== 1 ? 's' : ''} · ${gereed} gereed`}
        </p>
      </div>

      <ActiesTabel
        data={rijen}
        layouts={layouts}
        user_id={user_id}
        acties={
          <>
            {sjablonen.length > 0 && (
              <ActiveerSjabloonDialog dossier_id={dossier_id} sjablonen={sjablonen} />
            )}
            <NieuweDossierTaakKnop dossier={dossier} lijsten={lijsten} />
          </>
        }
      />
    </div>
  )
}
