import { redirect } from 'next/navigation'

// Uursoorten en uurtarieven zijn tabbladen van het Uren-scherm. Oude links blijven werken.
export default function PlanningInstellingenPage() {
  redirect('/instellingen/uren?deel=uursoorten')
}
