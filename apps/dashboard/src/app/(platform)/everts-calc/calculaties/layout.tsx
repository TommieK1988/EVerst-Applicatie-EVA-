export default function CalculatiesLayout({ children }: { children: React.ReactNode }) {
  // Neutraliseert de padding en max-breedte van EvertsCalcLayout
  // zodat de OverzichtTabel de volledige beschikbare breedte gebruikt.
  return (
    <div className="-m-4 sm:-m-6 lg:-m-8">
      {children}
    </div>
  )
}
