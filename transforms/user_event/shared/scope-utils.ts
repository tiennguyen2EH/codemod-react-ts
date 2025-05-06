import { Identifier } from 'jscodeshift';
import { Config } from './types';

export const findAllTestBlocks = (config: Config) => {
  return config.root
    .find(config.j.CallExpression)
    .filter(
      (path) =>
        path.value.callee.type === 'Identifier' &&
        (path.value.callee.name === 'it' || path.value.callee.name === 'test'),
    );
};

export const findAllSkippedTestBlocks = (config: Config) => {
  return config.root.find(config.j.CallExpression).filter((path) => {
    const callee = path.value.callee;
    return callee?.type === 'MemberExpression' && (callee?.property as Identifier).name === 'skip';
  });
};

export const findAllItEachTestBlocks = (config: Config) => {
  return config.root.find(config.j.CallExpression).filter((path) => {
    const callee = path.value.callee;
    if (callee.type === 'CallExpression') {
      return (
        callee.callee?.type === 'MemberExpression' &&
        (callee.callee?.property as Identifier).name === 'each'
      );
    }
    if (callee.type === 'TaggedTemplateExpression') {
      return (
        callee.tag?.type === 'MemberExpression' &&
        (callee.tag?.property as Identifier).name === 'each'
      );
    }
    return false;
  });
};
