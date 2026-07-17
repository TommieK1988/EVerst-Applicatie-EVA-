import { vereisModuleToegang } from '@/lib/auth/rechten'

export default async function TakenLayout({ children }: { children: React.ReactNode }) {
  // Dekt overzicht, lijsten én sjablonen. De actielijst-tab binnen een dossier valt
  // buiten deze route en blijft dus zonder dit recht werken.
  await vereisModuleToegang('taken')

  return (
    <div
      className="h-full p-4 sm:p-6 lg:p-8"
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
