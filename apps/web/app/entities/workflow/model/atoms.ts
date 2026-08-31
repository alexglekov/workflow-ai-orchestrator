import { atom } from 'jotai';
import type { Workflow } from './types';

export const workflowAtom = atom<Workflow | null>(null);

export const workflowsAtom = atom<Workflow[]>([]);
