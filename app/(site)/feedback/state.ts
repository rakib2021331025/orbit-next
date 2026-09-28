/**
 * Initial form states for ./actions.ts.
 *
 * They live here, not beside the actions: a 'use server' file may export only
 * async functions, and Next rejects the whole module at runtime otherwise.
 */
import type { FeedbackState } from './actions';

export const emptyFeedbackState: FeedbackState = {
  done: false,
  error: '',
  values: { name: '', course_name: '', rating: '5', feedback: '' },
};
