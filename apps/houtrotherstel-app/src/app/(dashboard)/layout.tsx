import Sidebar from '@/components/shared/Sidebar'
import TopBar from '@/components/shared/TopBar'
import { mockProfile } from '@/lib/mock-data'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar profile={mockProfile} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar profile={mockProfile} />
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6 lg:p-8 max-w-screen-2xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
