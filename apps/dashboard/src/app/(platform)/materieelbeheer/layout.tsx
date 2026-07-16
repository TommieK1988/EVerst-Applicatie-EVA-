import { vereisMaterieelToegang } from '@/lib/materieel/auth'

export default async function MaterieelbeheerLayout({ children }: { children: React.ReactNode }) {
  // Env-flag + ingelogde medewerker. In productie (flag uit) → notFound().
  await vereisMaterieelToegang()
  return <>{children}</>
}
