import type { Metadata } from 'next'
import { getActielijsten } from '@/lib/taken/services/taken'
import ActielijstenOverzicht from '@/components/taken/ActielijstenOverzicht'

export const metadata: Metadata = { title: 'Actielijsten' }

export default async function ActielijstenPage() {
  const lijsten = await getActielijsten()
  return <ActielijstenOverzicht lijsten={lijsten} />
}
