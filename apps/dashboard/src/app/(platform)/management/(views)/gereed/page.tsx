'use client'

import { useManagementData } from '@/components/management/ManagementShell'
import ManagementProjectenTabel from '@/components/management/ManagementProjectenTabel'

export default function ManagementGereedPage() {
  const { gereed, layouts, user_id } = useManagementData()
  return (
    <ManagementProjectenTabel rows={gereed} variant="gereed"
      scherm="management-gereed" layouts={layouts.gereed} user_id={user_id} />
  )
}
