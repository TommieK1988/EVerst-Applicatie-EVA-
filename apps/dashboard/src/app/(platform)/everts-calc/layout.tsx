// InstellingenSync staat in de platform-layout (app/(platform)/layout.tsx), zodat de
// calculatie-instellingen ook geladen worden in de dossiertabs buiten /everts-calc.

export default function EvertsCalcLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="p-4 sm:p-6 lg:p-8"
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
