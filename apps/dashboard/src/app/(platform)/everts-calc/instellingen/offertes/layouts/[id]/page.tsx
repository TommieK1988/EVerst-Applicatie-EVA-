import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getLayout } from '@/app/(platform)/everts-calc/actions/quote-instellingen'
import { getQuotes } from '@/lib/everts-calc/services/quotes'
import { getSjabloonteksten } from '@/app/(platform)/everts-calc/actions/sjabloonteksten'
import LayoutEditorClient from './LayoutEditorClient'

export const metadata: Metadata = { title: 'Layout bewerken' }

interface Props {
  params: Promise<{ id: string }>
}

export default async function LayoutEditorPage({ params }: Props) {
  const { id } = await params
  const [layout, quotes, sjabloonteksten] = await Promise.all([
    getLayout(id).catch(() => null),
    getQuotes(),
    getSjabloonteksten(),
  ])

  if (!layout) notFound()

  const voorbeeldQuote = quotes.find(q => q.quote_nummer) ?? quotes[0] ?? null

  return (
    <LayoutEditorClient
      layout={layout}
      voorbeeldQuoteId={voorbeeldQuote?.id ?? null}
      sjabloonteksten={sjabloonteksten}
    />
  )
}
