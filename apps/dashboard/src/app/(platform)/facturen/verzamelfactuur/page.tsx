import type { Metadata } from 'next'
import { vereisModuleToegang, getCurrentMedewerker, getEffectieveRechten } from '@/lib/auth/rechten'
import { heeftModuleToegang, isBeheerder } from '@/lib/auth/rechten-shared'
import { getWerkmaatschappijen, getRecenteVerzamelfacturen } from '@/lib/verzamelfactuur/actions'
import { laadBtwTarieven } from '@/lib/stamdata/btw-actions'
import VerzamelfactuurScherm from './VerzamelfactuurScherm'

export const metadata: Metadata = { title: 'Nieuwe verzamelfactuur' }

export default async function VerzamelfactuurPage() {
  await vereisModuleToegang('financieel')

  const medewerker = await getCurrentMedewerker()
  const rechten = await getEffectieveRechten(medewerker)
  const magBewerken = isBeheerder(rechten) || heeftModuleToegang(rechten, 'financieel', 'schrijven')

  const [werkmaatschappijen, recent, tarieven] = await Promise.all([
    getWerkmaatschappijen(),
    getRecenteVerzamelfacturen(),
    laadBtwTarieven(),
  ])

  return (
    <VerzamelfactuurScherm
      werkmaatschappijen={werkmaatschappijen}
      recent={recent}
      tarieven={tarieven}
      magBewerken={magBewerken}
    />
  )
}
