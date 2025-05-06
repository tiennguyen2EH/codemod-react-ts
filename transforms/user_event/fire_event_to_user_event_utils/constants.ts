export { BASE_RENDER_METHODS, POSSIBLE_SUPPORTED_RENDER_METHODS } from '../shared';

export const FIRE_EVENT_TO_USER_EVENT_MAP = {
  click: 'click',
  focus: 'click',
  mouseDown: 'click',
  mouseOver: 'hover',
  mouseEnter: 'hover',
  mouseOut: 'unhover',
  mouseMove: 'hover',
  mouseLeave: 'unhover',
  blur: 'blur',
  change: 'advancedType',
  input: 'advancedType',
  focusIn: 'hover',
  focusOut: 'unhover',
  doubleClick: 'dblClick',
  keyDown: 'keyboard',
  keyUp: 'keyboard',
} as const;
