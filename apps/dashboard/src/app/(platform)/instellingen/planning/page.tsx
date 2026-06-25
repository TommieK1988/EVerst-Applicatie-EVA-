import { redirect } from 'next/navigation'

// Uursoorten en uurtarieven zijn verplaatst naar Stamgegevens. Oude links blijven werken.
export default function PlanningInstellingenPage() {
  redirect('/instellingen/uursoorten-tarieven')
}
