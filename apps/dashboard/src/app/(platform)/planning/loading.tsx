export default function PlanningLoading() {
  return (
    <div className="eva-page">
      <div style={{ height: 32, width: 200, background: 'var(--bg-active)', borderRadius: 6, marginBottom: 8 }} />
      <div style={{ height: 20, width: 320, background: 'var(--bg-active)', borderRadius: 4, marginBottom: 28 }} />
      <div style={{ height: 40, width: '100%', background: 'var(--bg-active)', borderRadius: 8, marginBottom: 12 }} />
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} style={{ height: 44, background: i % 2 === 0 ? 'var(--bg-elev)' : 'var(--bg)', borderBottom: '1px solid var(--border)' }} />
        ))}
      </div>
    </div>
  )
}
