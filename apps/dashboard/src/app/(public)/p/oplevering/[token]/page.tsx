import { getOnderaannemerPortaal } from '../../actions'
import { OnderaannemerPortaal } from './OnderaannemerPortaal'
import { PortaalFout } from '../../PortaalFout'

export const dynamic = 'force-dynamic'

export default async function OpleveringPortaalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const data = await getOnderaannemerPortaal(token)
  if (!data.ok) return <PortaalFout melding={data.error ?? 'Deze link is niet (meer) geldig.'} />
  return <OnderaannemerPortaal token={token} data={data} />
}
