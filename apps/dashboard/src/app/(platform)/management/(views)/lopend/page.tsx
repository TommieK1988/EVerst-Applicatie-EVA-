'use client'

import { useManagementData } from '@/components/management/ManagementShell'
import ManagementProjectenTabel from '@/components/management/ManagementProjectenTabel'

export default function ManagementLopendPage() {
  const { lopend, layouts, user_id } = useManagementData()
  return (
    <ManagementProjectenTabel rows={lopend} variant="lopend"
      scherm="management-lopend" layouts={layouts.lopend} user_id={user_id} />
  )
}
