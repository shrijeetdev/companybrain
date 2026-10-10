import type { ReactNode } from 'react';
import { createStore, useStore } from './util';

export interface ToastAction { label: string; onClick: () => void }
export interface Toast {
  id: number;
  message: ReactNode;
  tone: 'default' | 'success' | 'error' | 'info';
  action?: ToastAction;
  duration: number;
  icon?: ReactNode;
}

export const toastStore = createStore<Toast[]>([]);
let seq = 1;

export function toast(message: ReactNode, opts: Partial<Omit<Toast, 'id' | 'message'>> = {}): number {
  const t: Toast = { id: seq++, message, tone: opts.tone ?? 'default', action: opts.action, duration: opts.duration ?? (opts.action ? 6000 : 3800), icon: opts.icon };
  toastStore.set((xs) => [...xs.slice(-3), t]);
  if (t.duration > 0) window.setTimeout(() => dismissToast(t.id), t.duration);
  return t.id;
}
toast.error = (message: ReactNode) => toast(message, { tone: 'error', duration: 5200 });
toast.success = (message: ReactNode, action?: ToastAction) => toast(message, { tone: 'success', action });

export function dismissToast(id: number): void {
  toastStore.set((xs) => xs.filter((t) => t.id !== id));
}
export const useToasts = () => useStore(toastStore);
