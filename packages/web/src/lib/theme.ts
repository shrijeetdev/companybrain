import { createStore, storage, useStore } from './util';

export type ThemeName = 'tactical' | 'classic';
export type ModePref = 'system' | 'light' | 'dark';
export type Mode = 'light' | 'dark';

interface ThemeState { theme: ThemeName; modePref: ModePref; mode: Mode }

const systemDark = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;

function resolve(pref: ModePref): Mode {
  return pref === 'system' ? (systemDark() ? 'dark' : 'light') : pref;
}

const initialTheme = (storage.get('cb.theme') as ThemeName | null) ?? 'tactical';
const initialModePref = (storage.get('cb.mode') as ModePref | null) ?? 'system';

export const themeStore = createStore<ThemeState>({
  theme: initialTheme === 'classic' ? 'classic' : 'tactical',
  modePref: initialModePref,
  mode: resolve(initialModePref),
});

function apply(s: ThemeState): void {
  const el = document.documentElement;
  el.dataset.theme = s.theme;
  el.dataset.mode = s.mode;
  const meta = document.querySelector('meta[name="theme-color"]');
  const color = s.theme === 'tactical' ? (s.mode === 'dark' ? '#060a10' : '#e9edf1') : s.mode === 'dark' ? '#07080f' : '#eef1f8';
  meta?.setAttribute('content', color);
}

export function initTheme(): void {
  apply(themeStore.get());
  themeStore.subscribe(() => apply(themeStore.get()));
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const s = themeStore.get();
    if (s.modePref === 'system') themeStore.set({ ...s, mode: resolve('system') });
  });
}

export function setTheme(theme: ThemeName): void {
  storage.set('cb.theme', theme);
  themeStore.set((s) => (s.theme === theme ? s : { ...s, theme }));
}
export function setModePref(modePref: ModePref): void {
  storage.set('cb.mode', modePref);
  themeStore.set((s) => ({ ...s, modePref, mode: resolve(modePref) }));
}
export function toggleMode(): void {
  const s = themeStore.get();
  setModePref(s.mode === 'dark' ? 'light' : 'dark');
}

export function useTheme(): ThemeState & { tactical: boolean } {
  const s = useStore(themeStore);
  return { ...s, tactical: s.theme === 'tactical' };
}
