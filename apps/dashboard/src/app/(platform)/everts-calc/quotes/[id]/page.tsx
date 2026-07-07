import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ id: string }>
}

export default async function QuoteEditorPage({ params }: Props) {
  const { id } = await params
  // De offerte-omgeving leeft in het dossier (Calculatie-tab). Deze losse route
  // valt terug op de bestaande preview-pagina; het pad zonder /everts-calc bestond niet.
  redirect(`/everts-calc/quotes/${id}/preview`)
}
