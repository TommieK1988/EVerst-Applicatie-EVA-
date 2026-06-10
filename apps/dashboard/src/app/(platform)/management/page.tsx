import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Management' }

export default function ManagementPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
      <div className="text-4xl">🚧</div>
      <h1 className="text-2xl font-semibold text-gray-800">Management dashboard</h1>
      <p className="text-gray-500 max-w-md">
        Deze module wordt opnieuw opgebouwd met live data uit Bouw7.
        De scraper-koppeling met calc.meenteen.nl is verwijderd.
      </p>
    </div>
  )
}
