import { atom } from 'jotai';
import type { ConnectorCatalog } from './types';

export const catalogAtom = atom<ConnectorCatalog[]>([]);
