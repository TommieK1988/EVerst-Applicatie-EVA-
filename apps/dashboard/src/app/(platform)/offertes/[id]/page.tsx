import { redirect } from 'next/navigation'

export default async function OfferteRootPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  redirect(`/offertes/${params.id}/informatie`)
}
