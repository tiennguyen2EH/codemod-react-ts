import type { BlockStatement } from 'jscodeshift';
import { Config } from './types';
import { hasViewDeclarationFromRenderMethods } from './setup-utils';

/**
 * Transforms user.method() calls to view.user.method() calls
 *
 * This function:
 * - Finds all user.method() calls and prefixes them with view
 * - Handles both direct calls and calls within await expressions
 * - Preserves method names and arguments
 * - Works on user.type, user.click, etc.
 *
 * @param {BlockStatement['body']} blockBody - The body of a block statement to search for user.method calls
 * @param {Config} config - The codemod configuration object
 * @returns {boolean} - True if any transformations were made, false otherwise
 */
export const prefixUserEventWithView = (
  blockBody: BlockStatement['body'],
  config: Config,
): boolean => {
  if (!hasViewDeclarationFromRenderMethods(blockBody, config)) {
    return false;
  }

  let hasModification = false;

  // First, handle direct user.method() calls
  config
    .j(blockBody)
    .find(config.j.CallExpression, {
      callee: {
        type: 'MemberExpression',
        object: { name: 'user' },
      },
    })
    .forEach((userEventPath) => {
      if (!userEventPath?.value?.callee) return;

      // Ensure callee is a MemberExpression
      if (userEventPath.value.callee.type !== 'MemberExpression') return;

      const callee = userEventPath.value.callee as any;
      if (!callee.property || callee.property.type !== 'Identifier') return;

      // Get the method name (e.g., click, type)
      const method = callee.property.name;

      console.log(`[DEBUG] Processing user.${method} to add view prefix`);

      // Create view.user.method member expression
      // First create user.method
      const userMethod = config.j.memberExpression(
        config.j.identifier('user'),
        config.j.identifier(method),
        false, // computed: false for dot notation
      );

      // Then create view.user.method
      const viewUserMember = config.j.memberExpression(
        config.j.identifier('view'),
        userMethod,
        false, // computed: false for dot notation
      );

      // Replace user.method with view.user.method, preserving the arguments
      config
        .j(userEventPath)
        .replaceWith(config.j.callExpression(viewUserMember, userEventPath.value.arguments));

      hasModification = true;
    });

  // Then, handle await expressions that contain user.method() calls
  config
    .j(blockBody)
    .find(config.j.AwaitExpression)
    .forEach((awaitPath) => {
      if (!awaitPath?.value?.argument) return;

      const argument = awaitPath.value.argument;
      if (argument.type !== 'CallExpression') return;

      const callExpr = argument as any;
      if (!callExpr.callee || callExpr.callee.type !== 'MemberExpression') return;

      const callee = callExpr.callee as any;
      if (!callee.object || callee.object.type !== 'Identifier' || callee.object.name !== 'user')
        return;
      if (!callee.property || callee.property.type !== 'Identifier') return;

      // Get the method name (e.g., click, type)
      const method = callee.property.name;

      console.log(`[DEBUG] Processing await user.${method} to add view prefix`);

      // Create view.user.method member expression
      // First create user.method
      const userMethod = config.j.memberExpression(
        config.j.identifier('user'),
        config.j.identifier(method),
        false, // computed: false for dot notation
      );

      // Then create view.user.method
      const viewUserMember = config.j.memberExpression(
        config.j.identifier('view'),
        userMethod,
        false, // computed: false for dot notation
      );

      // Replace user.method with view.user.method inside the await expression
      const newCallExpr = config.j.callExpression(viewUserMember, callExpr.arguments);
      awaitPath.value.argument = newCallExpr;

      hasModification = true;
    });

  if (hasModification) {
    console.log(`[DEBUG] Added view prefix to user calls in file: ${config.filePath}`);
  }
  return hasModification;
};
