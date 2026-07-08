import { getFeedbackPortaal } from '../../actions'
import { FeedbackPortaal } from './FeedbackPortaal'
import { PortaalFout } from '../../PortaalFout'

export const dynamic = 'force-dynamic'

export default async function FeedbackPortaalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const data = await getFeedbackPortaal(token)
  if (!data.ok) return <PortaalFout melding={data.error ?? 'Deze link is niet (meer) geldig.'} />
  return <FeedbackPortaal token={token} data={data} />
}
