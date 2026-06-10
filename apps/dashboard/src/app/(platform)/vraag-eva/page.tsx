import { Suspense } from 'react'
import ChatView from '@/components/eva/views/ChatView'

export const metadata = { title: 'Vraag EVA' }

export default function VraagEvaPage() {
  return (
    <Suspense>
      <ChatView />
    </Suspense>
  )
}
