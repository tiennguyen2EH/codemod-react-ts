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
