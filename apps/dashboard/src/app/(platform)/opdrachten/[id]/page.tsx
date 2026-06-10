import { redirect } from 'next/navigation'

export default async function OpdrachtRootPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  redirect(`/opdrachten/${params.id}/informatie`)
}
