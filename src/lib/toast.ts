import { create } from 'zustand';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'success';
}

interface ToastState {
  toasts: Toast[];
  push: (text: string, kind?: Toast['kind']) => void;
  dismiss: (id: number) => void;
}

let seq = 0;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (text, kind = 'info') => {
    const id = ++seq;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'error' ? 7000 : 3500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = (text: string, kind?: Toast['kind']) => useToasts.getState().push(text, kind);
export const toastError = (e: unknown) => {
  if ((e as Error)?.name === 'AbortError') return;
  toast((e as Error)?.message ?? String(e), 'error');
};
