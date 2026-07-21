import { notFound } from 'next/navigation'
import { getDeelname } from '@/lib/toolbox/deelname'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import ToolboxDoorloop from '@/components/toolbox/doorloop/ToolboxDoorloop'

export const metadata = { title: 'Toolbox · EVA Mobiel' }

export default async function MobielToolboxPage({ params }: { params: Promise<{ toewijzingId: string }> }) {
  const { toewijzingId } = await params

  const [deelname, medewerker] = await Promise.all([
    getDeelname(toewijzingId),
    getCurrentMedewerker(),
  ])
  if (!deelname) notFound()

  const standaardNaam = [medewerker?.voornaam, medewerker?.tussenvoegsel, medewerker?.achternaam]
    .filter(Boolean)
    .join(' ')

  return <ToolboxDoorloop deelname={deelname} standaardNaam={deelname.handtekeningNaam || standaardNaam} />
}
