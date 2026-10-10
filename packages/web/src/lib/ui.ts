import type { CreateTaskInput } from '@companybrain/types';
import { createStore, storage, useStore } from './util';

interface UiState {
  palette: boolean;
  quickAdd: { open: boolean; defaults?: Partial<CreateTaskInput> };
  help: boolean;
  more: boolean;
  collapsed: boolean;
  /** Task open in the detail drawer. */
  taskId: string | null;
}

export const uiStore = createStore<UiState>({
  palette: false,
  quickAdd: { open: false },
  help: false,
  more: false,
  collapsed: storage.get('cb.sidebar') === 'collapsed',
  taskId: null,
});
export const useUi = () => useStore(uiStore);

export const ui = {
  palette: (open = true) => uiStore.set((s) => ({ ...s, palette: open })),
  quickAdd: (open = true, defaults?: Partial<CreateTaskInput>) => uiStore.set((s) => ({ ...s, quickAdd: { open, defaults } })),
  help: (open = true) => uiStore.set((s) => ({ ...s, help: open })),
  more: (open = true) => uiStore.set((s) => ({ ...s, more: open })),
  toggleSidebar: () => uiStore.set((s) => {
    storage.set('cb.sidebar', s.collapsed ? 'open' : 'collapsed');
    return { ...s, collapsed: !s.collapsed };
  }),
  openTask: (id: string | null) => {
    uiStore.set((s) => ({ ...s, taskId: id }));
    // Mirror in the URL (?task=) so a refresh / share keeps the drawer open.
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('task', id); else url.searchParams.delete('task');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  },
};
