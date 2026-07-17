import { vereisModuleToegang } from '@/lib/auth/rechten'

/** De pagina zelf is een client component; de guard hoort daarom in deze layout. */
export default async function NieuwFormulierLayout({ children }: { children: React.ReactNode }) {
  await vereisModuleToegang('formulieren')
  return <>{children}</>
}
