import { redirect } from 'next/navigation'

export default async function AanvraagRootPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  redirect(`/aanvragen/${params.id}/informatie`)
}
