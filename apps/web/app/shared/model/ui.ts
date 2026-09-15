import { atom, useSetAtom } from 'jotai';
import { useCallback } from 'react';

export const errorAtom = atom<string | null>(null);

export const loadingAtom = atom(false);

export type ToastTone = 'ok' | 'error';

export type ToastItem = {
  id: string;
  message: string;
  tone: ToastTone;
  duration: number;
};

export const TOAST_DURATION = 5000;

export const toastsAtom = atom<ToastItem[]>([]);

let toastSeq = 0;

export const useToast = () => {
  const setToasts = useSetAtom(toastsAtom);

  return useCallback(
    (message: string, tone: ToastTone = 'ok', duration = TOAST_DURATION) => {
      const id = `toast-${++toastSeq}-${Date.now()}`;

      setToasts((current) => [{ id, message, tone, duration }, ...current]);
    },
    [setToasts],
  );
};
