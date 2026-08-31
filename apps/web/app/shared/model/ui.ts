import { atom } from 'jotai';

export const errorAtom = atom<string | null>(null);

export const loadingAtom = atom(false);
