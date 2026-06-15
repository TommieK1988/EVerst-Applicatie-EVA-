import { redirect } from 'next/navigation'

export default async function ServicedeskRootPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  redirect(`/servicedesk/${params.id}/informatie`)
}
