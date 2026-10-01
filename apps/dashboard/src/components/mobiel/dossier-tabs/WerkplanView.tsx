import { getWerkplan } from '@/lib/dossiers/werkplan'
import { getBetrokkenen } from '@/lib/dossiers/betrokkenen'
import { overigeBetrokkenen } from '@/lib/dossiers/werkplan-types'
import WerkplanWeergave from './WerkplanWeergave'

/**
 * Het werkplan op de telefoon: alleen-lezen. Ophalen hier, tonen in WerkplanWeergave — zo is de
 * weergave ook zonder sessie te bekijken.
 */
export default async function WerkplanView({ dossierId }: { dossierId: string }) {
  const [werkplan, betrokkenen] = await Promise.all([
    getWerkplan(dossierId).catch(() => null),
    getBetrokkenen(dossierId).then(overigeBetrokkenen).catch(() => []),
  ])
  return <WerkplanWeergave werkplan={werkplan} betrokkenen={betrokkenen} />
}
