// Tab-slug → toggle-sleutel. Een tab in deze map is alleen zichtbaar én
// toegankelijk wanneer de bijbehorende dossier-toggle aanstaat.
// Generiek opgezet: een nieuwe toggle-gestuurde tab is hier één regel.
// `vca` staat hier bewust niet meer in: die tab heet nu KAM/VGM en bundelt ook de
// oplevering en de formulieren, die los staan van de VCA-toggle. Op een opdracht is hij
// daarom altijd zichtbaar; op servicedesk hangt hij nog wel aan de toggle, via het veld
// `toggle` op de tab zelf (zie SERVICEDESK_TABS in Sidebar.tsx).
export const TAB_TOGGLE_GATES: Record<string, string> = {
  houtrot: 'houtrot_registreren',
  opname: 'mutatie_opname',
}
