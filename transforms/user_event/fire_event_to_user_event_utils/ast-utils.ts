import type { AwaitExpression, MemberExpression, ObjectPattern, Property } from 'jscodeshift';
import { Config } from './types';

// AST Utility Functions
export const createAwaitExpression = (expression: any, config: Config): AwaitExpression => {
  return config.j.awaitExpression(expression);
};

export const createMemberExpression = (
  object: any,
  property: string,
  config: Config,
): MemberExpression => {
  return config.j.memberExpression(object, config.j.identifier(property));
};

export const createProperty = (
  key: string,
  value: any,
  shorthand: boolean,
  config: Config,
): Property => {
  return config.j.property.from({
    kind: 'init',
    key: config.j.identifier(key),
    value: value as any,
    shorthand,
  });
};

export const createUserProperty = (config: Config): Property => {
  return createProperty('user', config.j.identifier('user'), true, config);
};

export const createObjectPattern = (properties: Property[], config: Config): ObjectPattern => {
  return config.j.objectPattern(properties);
};

export const createVariableDeclaration = (id: ObjectPattern, init: any, config: Config) => {
  return config.j.variableDeclaration('const', [config.j.variableDeclarator(id, init as any)]);
};
