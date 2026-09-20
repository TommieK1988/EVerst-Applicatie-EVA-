import { redirect } from 'next/navigation'
import { metTerug, veiligTerugPad } from '@/lib/mobiel/terug'

export default async function MobielDossierIndex({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  // De herkomst moet de redirect overleven, anders wijst de terugknop op het dossier alsnog
  // naar de dossierlijst.
  redirect(metTerug(`/m/dossiers/${id}/informatie`, veiligTerugPad(sp.terug)))
}
