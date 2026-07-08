import { getAkkoordPortaal } from '../../actions'
import { AkkoordPortaal } from './AkkoordPortaal'
import { PortaalFout } from '../../PortaalFout'

export const dynamic = 'force-dynamic'

export default async function AkkoordPortaalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const data = await getAkkoordPortaal(token)
  if (!data.ok) return <PortaalFout melding={data.error ?? 'Deze link is niet (meer) geldig.'} />
  return <AkkoordPortaal token={token} data={data} />
}
