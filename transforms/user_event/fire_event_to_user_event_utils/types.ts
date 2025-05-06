import type { Collection, JSCodeshift, Node } from 'jscodeshift';
import { FIRE_EVENT_TO_USER_EVENT_MAP } from './constants';

// Types
export type Config = {
  j: JSCodeshift;
  root: Collection<Node>;
  filePath: string;
};

export type FireEventMethod = keyof typeof FIRE_EVENT_TO_USER_EVENT_MAP;
export type UserEventMethod = (typeof FIRE_EVENT_TO_USER_EVENT_MAP)[FireEventMethod] | 'clear';
