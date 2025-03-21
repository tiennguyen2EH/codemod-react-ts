jest.autoMockOff();

import { defineTest } from 'jscodeshift/dist/testUtils';

const name = 'fire-event-to-user-event';
const fixtures = ['spec'] as const;

describe(name, () => {
  fixtures.forEach((test) =>
    defineTest(__dirname, name, null, `${name}/${test}`, {
      parser: 'tsx',
    }),
  );
});
