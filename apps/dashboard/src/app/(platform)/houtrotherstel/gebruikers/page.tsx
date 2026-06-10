import { Metadata } from 'next'
import Link from 'next/link'
import { Plus, UserCheck } from 'lucide-react'
import PageHeader from '@/components/houtrotherstel/shared/PageHeader'
import { getRolLabel, getInitials } from '@/lib/houtrotherstel/utils'
export const metadata: Metadata = { title: 'Gebruikers' }

const gebruikers: { id: string; full_name: string; email: string; role: string; active: boolean }[] = []

const rolKleuren: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700',
  platform_gebruiker: 'bg-everts-100 text-everts-dark',
  app_gebruiker: 'bg-slate-100 text-slate-700',
}

export default function GebruikersPage() {
  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      <PageHeader
        title="Gebruikers"
        description={`${gebruikers.length} gebruikers`}
        actions={
          <Link href="/houtrotherstel/gebruikers/nieuw"
            className="inline-flex items-center gap-2 bg-everts hover:bg-everts-dark text-white font-medium px-4 py-2.5 rounded-lg text-sm transition-colors">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nieuwe gebruiker</span>
          </Link>
        }
      />

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="hidden md:table w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Gebruiker</th>
              <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Rol</th>
              <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Status</th>
              <th className="text-right px-4 py-3 font-medium text-slate-500 text-xs">Acties</th>
            </tr>
          </thead>
          <tbody>
            {gebruikers.map(g => (
              <tr key={g.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-everts-100 rounded-full flex items-center justify-center text-everts text-xs font-bold">
                      {getInitials(g.full_name)}
                    </div>
                    <div>
                      <div className="font-medium text-slate-800">{g.full_name}</div>
                      <div className="text-xs text-slate-400">{g.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${rolKleuren[g.role]}`}>
                    {getRolLabel(g.role)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
                    <UserCheck className="w-3.5 h-3.5" /> Actief
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/gebruikers/${g.id}`} className="text-xs text-everts hover:underline px-2 py-1">
                    Bewerken
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="md:hidden divide-y divide-slate-100">
          {gebruikers.map(g => (
            <Link key={g.id} href={`/gebruikers/${g.id}`}
              className="flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors">
              <div className="w-10 h-10 bg-everts-100 rounded-full flex items-center justify-center text-everts text-sm font-bold">
                {getInitials(g.full_name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-800">{g.full_name}</div>
                <div className="text-xs text-slate-400">{g.email}</div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${rolKleuren[g.role]}`}>
                {getRolLabel(g.role)}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
