import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { GeenToegangError } from '@/lib/auth/rechten'
import { getPortaalChat } from '@/lib/portaal/chat'
import { Chat } from './Chat'

export const metadata: Metadata = { title: 'Berichten' }
export const dynamic = 'force-dynamic'

/**
 * Het gesprek met het projectteam. Interne kanttekeningen zijn er al in de
 * query uit gefilterd — zie lib/portaal/chat.ts.
 */
export default async function BerichtenPagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let berichten
  try {
    berichten = await getPortaalChat(id)
  } catch (e) {
    if (e instanceof GeenToegangError) notFound()
    throw e
  }

  return <Chat dossierId={id} berichten={berichten} />
}
