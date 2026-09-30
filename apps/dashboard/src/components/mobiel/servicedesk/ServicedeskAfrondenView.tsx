import { getServicedeskAfronding } from '@/lib/dossiers/servicedesk-afronden'
import { getDossierNotities } from '@/lib/dossiers/notities-actions'
import ServicedeskAfrondenBlok from './ServicedeskAfrondenBlok'

/**
 * Server-kant van "Bon afronden": haalt gereedmelding + pakbonnen op en geeft ze als props door,
 * zodat de telefoon op 4G niet eerst een leeg blok toont en daarna gaat laden.
 */
export default async function ServicedeskAfrondenView({ dossierId, magBewerken }: {
  dossierId: string
  magBewerken: boolean
}) {
  const [afronding, notities] = await Promise.all([
    getServicedeskAfronding(dossierId).catch(() => null),
    getDossierNotities(dossierId).catch(() => []),
  ])
  if (!afronding) return null
  return (
    <ServicedeskAfrondenBlok
      dossierId={dossierId} afronding={afronding} notities={notities} magBewerken={magBewerken}
    />
  )
}
