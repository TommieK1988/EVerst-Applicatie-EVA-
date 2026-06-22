'use client'

import { useManagementData } from '@/components/management/ManagementShell'
import ManagementProjectenTabel from '@/components/management/ManagementProjectenTabel'

export default function ManagementServicedeskPage() {
  const { servicedesk, layouts, user_id } = useManagementData()
  return (
    <ManagementProjectenTabel rows={servicedesk} variant="servicedesk"
      scherm="management-servicedesk" layouts={layouts.servicedesk} user_id={user_id} />
  )
}
