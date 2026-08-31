import { atom } from 'jotai';
import type { Connection } from './types';

export const connectionsAtom = atom<Connection[]>([]);
