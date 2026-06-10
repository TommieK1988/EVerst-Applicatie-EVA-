import TopBar from '@/components/shared/TopBar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      <TopBar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-4 sm:p-6 lg:p-8 max-w-screen-2xl mx-auto pb-20 lg:pb-8">
          {children}
        </div>
      </main>
    </div>
  )
}
