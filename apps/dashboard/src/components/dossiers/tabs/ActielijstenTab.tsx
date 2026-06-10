import { getActielijstenVoorDossier, getSjablonen } from '@/lib/taken/services/taken'
import ActiveerSjabloonDialog from '../ActiveerSjabloonDialog'
import { ActielijstenKaarten } from '../ActielijstenKaarten'

interface Props {
  dossier_id: string
}

export default async function ActielijstenTab({ dossier_id }: Props) {
  const [lijsten, sjablonen] = await Promise.all([
    getActielijstenVoorDossier(dossier_id),
    getSjablonen(),
  ])

  return (
    <div style={{ padding: '32px 40px', maxWidth: 860 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>Actielijsten</h2>
          <p style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 4 }}>
            {lijsten.length === 0
              ? 'Nog geen actielijsten aan dit dossier gekoppeld.'
              : `${lijsten.length} actielijst${lijsten.length !== 1 ? 'en' : ''}`}
          </p>
        </div>
        {sjablonen.length > 0 && (
          <ActiveerSjabloonDialog dossier_id={dossier_id} sjablonen={sjablonen} />
        )}
      </div>

      <ActielijstenKaarten lijsten={lijsten} />
    </div>
  )
}
