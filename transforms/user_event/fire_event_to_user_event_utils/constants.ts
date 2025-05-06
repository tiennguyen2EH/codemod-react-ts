// Constants
export const BASE_RENDER_METHODS = [
  'renderWithReduxForm',
  'renderWithRedux',
  'renderWithTheme',
] as const;

export const POSSIBLE_SUPPORTED_RENDER_METHODS = [
  'setUp',
  'setup',
  'setupTest',
  'renderComponent',
  'setUpAndRenderComponentWithMockData',
  'prepareDataAndRender',
  'setUpAndRender',
  'render',
  'renderForm',
  ...BASE_RENDER_METHODS,
] as const;

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
