import { redirect } from 'next/navigation'

export default async function MobielDossierIndex({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/m/dossiers/${id}/informatie`)
}
