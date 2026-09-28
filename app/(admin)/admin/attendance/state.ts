/**
 * Initial form states for ./actions.ts.
 *
 * They live here, not beside the actions: a 'use server' file may export only
 * async functions, and Next rejects the whole module at runtime otherwise.
 */
import type { RegisterState } from './actions';

export const emptyRegisterState: RegisterState = { error: '', message: '', notes: [] };
