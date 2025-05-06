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

/**
 * Checks if a 'view' variable is declared with a supported render method
 * e.g., const view = renderWithRedux() or const view = render()
 *
 * @param {BlockStatement['body']} blockBody - The body of a block statement to search for view variable declaration
 * @param {Config} config - The codemod configuration object
 * @returns {boolean} - True if a 'view' variable declaration using a supported render method exists
 */
export const hasViewDeclarationFromRenderMethods = (
  blockBody: BlockStatement['body'],
  config: Config,
): boolean => {
  let foundViewDeclaration = false;

  config
    .j(blockBody)
    .find(config.j.VariableDeclarator)
    .forEach((varDeclPath) => {
      // Look for const view = ...
      if (
        varDeclPath.value.type === 'VariableDeclarator' &&
        varDeclPath.value.id.type === 'Identifier' &&
        varDeclPath.value.id.name === 'view'
      ) {
        // Check if initialization is a call to a supported render method
        if (
          varDeclPath.value.init &&
          varDeclPath.value.init.type === 'CallExpression' &&
          varDeclPath.value.init.callee.type === 'Identifier'
        ) {
          const calleeName = varDeclPath.value.init.callee.name;
          if (POSSIBLE_SUPPORTED_RENDER_METHODS.includes(calleeName as any)) {
            console.log(
              `[DEBUG] Found view declaration using ${calleeName} in file: ${config.filePath}`,
            );
            foundViewDeclaration = true;
          }
        }
      }
    });

  return foundViewDeclaration;
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
