export default function TakenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="h-full p-4 sm:p-6 lg:p-8 max-w-screen-2xl mx-auto"
      style={{
        '--border': '214.3 31.8% 91.4%',
        '--input':  '214.3 31.8% 91.4%',
        '--accent': '141 85% 26%',
        '--accent-foreground': '0 0% 100%',
        '--ring':   '141 85% 26%',
      } as React.CSSProperties}
    >
      {children}
    </div>
  )
}
