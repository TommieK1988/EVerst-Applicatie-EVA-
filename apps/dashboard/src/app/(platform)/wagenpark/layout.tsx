import { vereisModuleToegang } from '@/lib/auth/rechten'

export default async function WagenparkLayout({ children }: { children: React.ReactNode }) {
  await vereisModuleToegang('wagenpark')
  return (
    <div
      className="p-4 sm:p-6 lg:p-8 max-w-none"
      style={{
        // Reset shadcn CSS tokens naar HSL-formaat zodat Tailwind klassen correct werken.
        // De .eva scope overschrijft --border met hex (#e5e4dc) en --accent met var(--brand),
        // waardoor hsl(var(--border)) en hsl(var(--accent)) ongeldige CSS worden.
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
