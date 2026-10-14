/** Bedragen en datums op het verzamelfactuurscherm. */
export const euro = (n: number): string =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)

export const datum = (d: string): string => new Date(d).toLocaleDateString('nl-NL')
