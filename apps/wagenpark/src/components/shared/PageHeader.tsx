type Props = {
  titel: string
  omschrijving?: string
  actions?: React.ReactNode
}

export default function PageHeader({ titel, omschrijving, actions }: Props) {
  return (
    <div className="flex items-start justify-between mb-6 gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold text-slate-900">{titel}</h1>
        {omschrijving && (
          <p className="text-sm text-slate-500 mt-1">{omschrijving}</p>
        )}
      </div>
      {actions && <div className="flex gap-2 flex-shrink-0">{actions}</div>}
    </div>
  )
}
