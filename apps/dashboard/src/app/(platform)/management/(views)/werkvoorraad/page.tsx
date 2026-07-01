import { getWerkvoorraad } from '@/lib/dashboard/werkvoorraad'
import WerkvoorraadView from '@/components/management/WerkvoorraadView'

// Capaciteit wordt live berekend uit roosters/verlof — niet statisch cachen.
export const dynamic = 'force-dynamic'

export default async function ManagementWerkvoorraadPage() {
  const data = await getWerkvoorraad()
  return <WerkvoorraadView data={data} />
}
