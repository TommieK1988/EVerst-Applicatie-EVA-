/**
 * Opmaak van de uitklapmenu's in de werkbalk van de calculatie. Eén plek, zodat Bibliotheek,
 * Meetstaat, Bewerken, Tonen, de kolommenu's, Meer en Offerte er hetzelfde uitzien.
 */
export const menuInhoud = 'bg-white rounded-[10px] shadow-xl border border-neutral-200 py-1 min-w-[220px] z-[200]'
export const menuItem = 'flex items-center gap-2 px-3 py-2 text-xs text-neutral-700 hover:bg-neutral-50 cursor-pointer outline-none rounded-md mx-1 data-[highlighted]:bg-neutral-50 data-[disabled]:opacity-40 data-[disabled]:cursor-default'
export const menuKop = 'px-3 pt-2 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-400'
export const menuScheiding = 'h-px bg-neutral-100 my-1'
/** Tweede regel onder een menu-item: wat het doet, in een paar woorden. */
export const menuUitleg = 'block text-[11px] text-neutral-400'

/**
 * Wanneer een knop zijn naam toont. De balk moet op één regel passen, ook met de zijbalk open
 * (224px): op 1280 blijft ±1050px over, op 1536 ±1310px, op 1800 ±1575px. Met alle namen is hij
 * ±1700px breed, dus krijgen eerst de werkknoppen hun naam (2xl) en pas daarna de weergave-
 * knoppen (ruim). Terug, Kolommen en Meer blijven icoon; hun naam staat in de tooltip.
 */
export const LABEL_2XL = 'hidden 2xl:inline'
export const LABEL_RUIM = 'hidden min-[1800px]:inline'
