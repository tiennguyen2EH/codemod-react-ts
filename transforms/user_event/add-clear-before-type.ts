/**
 * Add user.clear() Before user.advancedType()
 *
 * This codemod automatically adds a user.clear() call before each user.advancedType() call
 * in test files to ensure the input is cleared before typing.
 *
 * Features:
 * - Finds all user.advancedType() calls in test files
 * - Adds a user.clear() call with the same element before each advancedType call
 * - Can target specific lines via the options.lines parameter
 * - Provides debug logging for transformation steps
 * - Handles error conditions gracefully
 */

import type { API, ASTPath, CallExpression, FileInfo } from 'jscodeshift';

import {
  Config,
  findAllItEachTestBlocks,
  findAllSkippedTestBlocks,
  findAllTestBlocks,
  prefixUserEventWithView,
} from './shared';

const getLinesToProcess = (lines: string | number | undefined) => {
  if (!lines) return [];
  if (typeof lines === 'number') return [lines];
  const lineNumbers = lines.split(',').map((line) => parseInt(line, 10));
  return lineNumbers.filter((line) => !isNaN(line));
};

const getBodyFromCallbackPath = (callbackPath: ASTPath<CallExpression>) => {
  const callback = callbackPath.value.arguments[1];
  if (callback.type !== 'FunctionExpression' && callback.type !== 'ArrowFunctionExpression') return;

  const body = callback.body.type === 'BlockStatement' ? callback.body.body : [];
  if (!Array.isArray(body)) return null;
  return body;
};

// Main Transformer
export default function transformer(file: FileInfo, api: API, options: { lines?: string }) {
  const j = api.jscodeshift;
  const root = j(file.source);
  const config: Config = { j, root, filePath: file.path };

  try {
    console.log(`[DEBUG] Transforming file: ${file.path}`);

    // Parse line numbers from options
    const linesToProcess = getLinesToProcess(options.lines);

    console.log(`[DEBUG] Processing lines: ${linesToProcess.join(', ')}`);

    // Find all user.advancedType calls
    const advancedTypeCalls = root.find(j.CallExpression, {
      callee: {
        type: 'MemberExpression',
        property: { type: 'Identifier', name: 'advancedType' },
      },
    });

    console.log(`[DEBUG] Found ${advancedTypeCalls.length} user.advancedType calls in total`);

    // Process each advancedType call
    advancedTypeCalls.forEach((path) => {
      // Get the location of this call
      const loc = path.value.loc;
      if (!loc) return;

      const callStartLine = loc.start.line;

      // Process if no specific lines provided or if this call is at one of the specified lines
      if (linesToProcess.length === 0 || linesToProcess.includes(callStartLine)) {
        console.log(`[DEBUG] Processing user.advancedType call at line ${callStartLine}`);

        // Get the first argument (the element to clear)
        const elementArg = path.value.arguments[0];
        if (!elementArg) {
          console.log('[DEBUG] Could not find element argument in advancedType call');
          return;
        }

        // Find the statement that contains the advancedType call
        let currentPath = path;
        while (currentPath.parent && !j.ExpressionStatement.check(currentPath.parent.value)) {
          currentPath = currentPath.parent;
        }

        if (!currentPath.parent || !j.ExpressionStatement.check(currentPath.parent.value)) {
          console.log('[DEBUG] Could not find parent statement');
          return;
        }

        const parentStatement = currentPath.parent;

        // Create a user.clear() call with the same element
        const clearCall = j.callExpression(
          j.memberExpression(j.identifier('user'), j.identifier('clear')),
          [elementArg],
        );

        // Always wrap in await since it's always an await expression
        const clearExpression = j.awaitExpression(clearCall);

        // Get the original expression (which contains the advancedType call)
        const originalExpression = parentStatement.value.expression;

        // Create a block statement with both clear and advancedType calls
        const blockStatement = j.blockStatement([
          j.expressionStatement(clearExpression),
          j.expressionStatement(originalExpression),
        ]);

        // Replace the original statement with the block
        j(parentStatement).replaceWith(blockStatement.body);

        console.log(`[DEBUG] Added user.clear call before advancedType at line ${callStartLine}`);
      }
    });

    // Process all test blocks and apply user event prefix
    findAllTestBlocks(config).forEach((path) => {
      const body = getBodyFromCallbackPath(path);
      if (!body) return;
      prefixUserEventWithView(body, config);
    });

    // Process 'it.skip' and 'test.skip' tests
    findAllSkippedTestBlocks(config).forEach((path) => {
      const body = getBodyFromCallbackPath(path);
      if (!body) return;
      prefixUserEventWithView(body, config);
    });

    findAllItEachTestBlocks(config).forEach((path) => {
      const body = getBodyFromCallbackPath(path);
      if (!body) return;
      prefixUserEventWithView(body, config);
    });

    return root.toSource({ quote: 'single' });
  } catch (error) {
    console.error(`[ERROR] Transformation failed for file: ${file.path}`, error.message);
    return file.source;
  }
}
