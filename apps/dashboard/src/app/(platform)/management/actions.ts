'use server'

export async function syncManagementAction(): Promise<{ nieuw: number; bijgewerkt: number; fouten: number; foutMelding?: string }> {
  return { nieuw: 0, bijgewerkt: 0, fouten: 1, foutMelding: 'Management sync wordt herbouwd met Bouw7 API' }
}
