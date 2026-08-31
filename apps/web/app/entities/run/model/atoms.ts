import { atom } from 'jotai';
import type { Run } from './types';

export const runAtom = atom<Run | null>(null);
