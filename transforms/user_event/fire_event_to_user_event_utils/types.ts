import { FIRE_EVENT_TO_USER_EVENT_MAP } from './constants';

export type { Config } from '../shared';

export type FireEventMethod = keyof typeof FIRE_EVENT_TO_USER_EVENT_MAP;
export type UserEventMethod = (typeof FIRE_EVENT_TO_USER_EVENT_MAP)[FireEventMethod] | 'clear';
