import type { ASTPath, Expression, VariableDeclarator, BlockStatement } from 'jscodeshift';
import { Config } from './types';
import { POSSIBLE_SUPPORTED_RENDER_METHODS } from './constants';
import {
  createAwaitExpression,
  createObjectPattern,
  createUserProperty,
  createProperty,
  createVariableDeclaration,
} from './ast-utils';

// Setup Function Handling
export const handleDirectAwaitSetup = (
  parentPath: ASTPath<any>,
  setupCall: Expression,
  config: Config,
) => {
  const userPattern = createObjectPattern([createUserProperty(config)], config);
  const variableDecl = createVariableDeclaration(
    userPattern,
    createAwaitExpression(setupCall, config),
    config,
  );
  config.j(parentPath.get()).replaceWith(variableDecl);
};

export const handleVariableDeclaratorSetup = (
  declarator: VariableDeclarator,
  setupCall: any,
  isAwaited: boolean,
  config: Config,
) => {
  if (declarator.id.type === 'ObjectPattern') {
    const userExists = declarator.id.properties.some((prop: any) => {
      if (prop.type !== 'Property') return false;
      return prop.key && prop.key.type === 'Identifier' && prop.key.name === 'user';
    });
    if (!userExists) {
      declarator.id.properties.push(createUserProperty(config));
    }
  } else if (declarator.id.type === 'Identifier') {
    const idName = declarator.id.name;
    declarator.id = createObjectPattern(
      [
        createUserProperty(config),
        createProperty(idName, config.j.identifier(idName), true, config),
      ],
      config,
    );
  }

  declarator.init = isAwaited ? createAwaitExpression(setupCall as any, config) : setupCall;
};

export const getUserFromSetup = (blockBody: BlockStatement['body'], config: Config) => {
  if (hasUserDestructured(blockBody, config)) {
    return;
  }

  config
    .j(blockBody)
    .find(config.j.CallExpression, {
      callee: {
        type: 'Identifier',
        name: (name) => POSSIBLE_SUPPORTED_RENDER_METHODS.includes(name as any),
      },
    })
    .forEach((setupPath) => {
      const parentPath = setupPath.parentPath;
      const isAwaited =
        parentPath.value.type === 'AwaitExpression' ||
        (parentPath.parentPath?.value.type === 'VariableDeclarator' &&
          parentPath.parentPath.value.init?.type === 'AwaitExpression');

      const setupCall = isAwaited
        ? parentPath.value.type === 'AwaitExpression'
          ? parentPath.value.argument
          : parentPath.parentPath.value.init.argument
        : setupPath.value;

      if (
        parentPath.value.type === 'AwaitExpression' &&
        parentPath.parentPath?.value.type !== 'VariableDeclarator'
      ) {
        handleDirectAwaitSetup(parentPath, setupCall, config);
        return;
      }

      const targetDeclarator =
        parentPath.value.type === 'AwaitExpression'
          ? parentPath.parentPath?.value
          : parentPath.value;

      if (targetDeclarator?.type === 'VariableDeclarator') {
        handleVariableDeclaratorSetup(targetDeclarator, setupCall, isAwaited, config);
      } else {
        const userPattern = createObjectPattern([createUserProperty(config)], config);
        config
          .j(setupPath)
          .replaceWith(
            createVariableDeclaration(
              userPattern,
              isAwaited ? createAwaitExpression(setupCall, config) : setupCall,
              config,
            ),
          );
      }
    });

  console.log(
    `[DEBUG] 'user' added inline, preserving 'await' where necessary in ${config.filePath}`,
  );
};

export const hasUserDestructured = (blockBody: BlockStatement['body'], config: Config): boolean => {
  return config
    .j(blockBody)
    .find(config.j.VariableDeclarator)
    .some((varDeclPath) => {
      return (
        varDeclPath.value.id.type === 'ObjectPattern' &&
        varDeclPath.value.id.properties.some((prop) => (prop as any).key.name === 'user')
      );
    });
};
