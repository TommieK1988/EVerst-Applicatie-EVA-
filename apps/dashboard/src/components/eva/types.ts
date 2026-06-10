/** Verouderd — routing gaat nu via Next.js App Router. Bewaard voor backward compat. */
export type Route = 'home' | 'sources' | 'chat' | 'library' | 'settings';

export type Tweaks = {
  theme:              'light' | 'dark';
  density:            'default' | 'dense';
  sidebarCollapsed:   boolean;
  autoCollapseOnApps: boolean;
};

export const TWEAK_DEFAULTS: Tweaks = {
  theme:              'light',
  density:            'default',
  sidebarCollapsed:   false,
  autoCollapseOnApps: false,
};
