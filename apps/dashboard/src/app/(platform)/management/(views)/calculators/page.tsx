'use client'

import { useManagementData } from '@/components/management/ManagementShell'
import CalculatorsView from '@/components/management/CalculatorsView'

export default function ManagementCalculatorsPage() {
  const { calculators } = useManagementData()
  return <CalculatorsView calculators={calculators} />
}
