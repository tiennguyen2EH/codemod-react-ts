/**
 * Core Requirements
 *
 * Import Management:
 * - Removes unused fireEvent imports from @testing-library/react
 * - Automatically cleans up import statements when fireEvent is no longer used
 * - Preserves other imports from @testing-library/react
 *
 * Event Migration:
 * - Converts fireEvent methods to userEvent methods based on FIRE_EVENT_TO_USER_EVENT_MAP
 * - Handles special cases for change/input events with target.value
 * - Makes test callbacks async when needed
 *
 * Setup Function Handling:
 * - Supports multiple setup function names (SUPPORTED_RENDER_METHODS)
 * - Automatically adds user to destructured setup results
 * - Preserves existing destructuring patterns
 *
 * Test Block Processing:
 * - Processes both global it and it.each test blocks
 * - Makes test callbacks async when needed
 * - Preserves existing test structure and assertions
 * - Maintains test block context and scope
 *
 * Error Handling:
 * - Gracefully handles null/undefined AST nodes
 * - Validates AST node types before transformations
 * - Returns original source on transformation failure
 * - Provides debug logging for transformation steps
 */

import type {
  API,
  BlockStatement,
  FileInfo,
  Identifier,
  ImportSpecifier,
  CallExpression,
  ASTPath,
} from 'jscodeshift';

// Configuration
const SUPPORTED_RENDER_METHODS = [
  'setUp',
  'setup',
  'renderWithReduxForm',
  'renderWithRedux',
  'renderWithTheme',
] as const;

const FIRE_EVENT_TO_USER_EVENT_MAP = {
  click: 'click',
  focus: 'click',
  mouseOver: 'hover',
  mouseOut: 'unhover',
  blur: 'blur',
  change: 'type',
  input: 'type',
} as const;

type FireEventMethod = keyof typeof FIRE_EVENT_TO_USER_EVENT_MAP;
type UserEventMethod = (typeof FIRE_EVENT_TO_USER_EVENT_MAP)[FireEventMethod];

// Utility functions
const createUserEventCall = (j: any, method: UserEventMethod, args: any[]) => {
  return j.awaitExpression(
    j.callExpression(j.memberExpression(j.identifier('user'), j.identifier(method)), args),
  );
};

const isTargetValueObject = (obj: any): boolean => {
  return (
    obj.type === 'ObjectExpression' &&
    obj.properties.some(
      (prop: any) =>
        prop.key.type === 'Identifier' &&
        prop.key.name === 'target' &&
        prop.value.type === 'ObjectExpression' &&
        prop.value.properties.some(
          (innerProp) => innerProp.key.type === 'Identifier' && innerProp.key.name === 'value',
        ),
    )
  );
};

const extractValueFromTarget = (obj: any): any => {
  const targetProperty = obj.properties.find((prop: any) => prop.key.name === 'target');
  const valueProperty = targetProperty.value.properties.find(
    (innerProp) => innerProp.key.name === 'value',
  );
  return valueProperty.value;
};

export default function transformer(file: FileInfo, api: API) {
  const j = api.jscodeshift;
  const root = j(file.source);

  const removeFireEventImport = () => {
    // Step 1: Find all imports of 'fireEvent' from '@testing-library/react'
    root
      .find(j.ImportDeclaration, {
        source: { value: '@testing-library/react' },
      })
      .forEach((path) => {
        if (!path || !path.value || !path.value.specifiers) return; // Guard against null

        const specifiers = path.value.specifiers as ImportSpecifier[];

        // Step 2: Find the 'fireEvent' specifier
        const fireEventSpecifier = specifiers.find(
          (specifier) => specifier.imported && specifier.imported.name === 'fireEvent',
        );

        if (fireEventSpecifier) {
          // Step 3: Check if 'fireEvent' is used in the file
          const fireEventIsUsed = root
            .find(j.Identifier, { name: 'fireEvent' })
            .some((identifierPath) => {
              const parentNode = identifierPath.parentPath.value;
              // Ensure 'fireEvent' is not part of the import declaration itself
              return parentNode.type !== 'ImportSpecifier';
            });

          if (!fireEventIsUsed) {
            // Remove the 'fireEvent' specifier
            specifiers.splice(specifiers.indexOf(fireEventSpecifier), 1);

            // If no specifiers remain, remove the entire ImportDeclaration
            if (specifiers.length === 0) {
              j(path).remove();
            }

            console.log(`[DEBUG] Removed unused 'fireEvent' import from: ${file.path}`);
          }
        }
      });
  };

  const replaceFireEventWithUserEvent = (blockBody: BlockStatement['body']) => {
    let hasReplacement = false;
    j(blockBody)
      .find(j.CallExpression, { callee: { object: { name: 'fireEvent' } } })
      .forEach((fireEventPath) => {
        if (!fireEventPath || !fireEventPath.value) return;

        if (fireEventPath.value.callee.type !== 'MemberExpression') {
          return;
        }

        const callee = fireEventPath.value.callee;

        if (callee.property.type !== 'Identifier') {
          return;
        }

        const method = callee.property.name as FireEventMethod;
        const args = fireEventPath.value.arguments;

        // Check if the method is supported in our mapping
        const userEventMethod = FIRE_EVENT_TO_USER_EVENT_MAP[method];
        if (!userEventMethod) return;

        // Handle special cases for change/input events
        if ((method === 'change' || method === 'input') && args.length === 2) {
          const [element, secondArg] = args;

          // Ensure the second argument is an object expression with target -> value
          if (isTargetValueObject(secondArg)) {
            const value = extractValueFromTarget(secondArg);
            j(fireEventPath).replaceWith(createUserEventCall(j, userEventMethod, [element, value]));
            hasReplacement = true;
          }
        } else if (args.length === 1) {
          // Handle simple events (click, hover, blur, etc.)
          j(fireEventPath).replaceWith(createUserEventCall(j, userEventMethod, args));
          hasReplacement = true;
        }
      });

    if (hasReplacement) {
      console.log(`[DEBUG] Replaced fireEvent calls with userEvent in file: ${file.path}`);
    }
    return hasReplacement;
  };

  const addAsyncToCallback = (callback) => {
    if (!callback.async) {
      callback.async = true;
      console.log(`[DEBUG] Made callback async in file: ${file.path}`);
    }
  };

  const getUserFromSetup = (blockBody: BlockStatement['body']) => {
    j(blockBody)
      .find(j.CallExpression, {
        callee: { type: 'Identifier', name: (name) => SUPPORTED_RENDER_METHODS.includes(name) },
      })
      .forEach((setupPath) => {
        const parentPath = setupPath.parentPath;

        if (parentPath.value.type === 'VariableDeclarator') {
          const declarator = parentPath.value;

          // If the left-hand side is already a destructuring pattern
          if (declarator.id.type === 'ObjectPattern') {
            // Check if 'user' is already in the destructuring
            const userExists = declarator.id.properties.some((prop) => prop.key.name === 'user');

            if (!userExists) {
              // Add 'user' to the existing destructuring
              declarator.id.properties.push(
                j.property.from({
                  kind: 'init',
                  key: j.identifier('user'),
                  value: j.identifier('user'),
                  shorthand: true,
                }),
              );
            }
          } else {
            // Replace simple variable assignment with destructuring
            declarator.id = j.objectPattern([
              j.property.from({
                kind: 'init',
                key: j.identifier('user'),
                value: j.identifier('user'),
                shorthand: true,
              }),
            ]);
          }
        } else {
          // If setup is not part of a variable declaration, add a new destructuring
          j(setupPath).replaceWith(
            j.variableDeclaration('const', [
              j.variableDeclarator(
                j.objectPattern([
                  j.property.from({
                    kind: 'init',
                    key: j.identifier('user'),
                    value: j.identifier('user'),
                    shorthand: true,
                  }),
                ]),
                j.callExpression(
                  j.identifier((setupPath.value.callee as Identifier).name),
                  setupPath.value.arguments,
                ),
              ),
            ]),
          );
        }
      });
    console.log(`[DEBUG] Added 'user' to existing destructuring in file: ${file.path}`);
    console.log(`[DEBUG] Replaced variable assignment with destructuring in file: ${file.path}`);
    console.log(
      `[DEBUG] Added new destructuring 'const { user } = setup();' in file: ${file.path}`,
    );
  };

  const handleTestCallback = (callbackPath: ASTPath<CallExpression>) => {
    if (!callbackPath || !callbackPath.value || !callbackPath.value.arguments) return; // Guard against null/undefined itPath

    const callback = callbackPath.value.arguments[1];
    if (
      !callback ||
      (callback.type !== 'FunctionExpression' && callback.type !== 'ArrowFunctionExpression')
    )
      return;

    const body = callback.body.type === 'BlockStatement' ? callback.body.body : [];

    if (!Array.isArray(body)) return; // Ensure body is an array

    const hasFireEventReplacement = replaceFireEventWithUserEvent(body);

    if (!hasFireEventReplacement) return; // Skip if no replacements were made

    getUserFromSetup(body);

    addAsyncToCallback(callback);
  };

  try {
    console.log(`[DEBUG] Transforming file: ${file.path}`);

    // Find all jest.it blocks
    // Find all jest.it or global it blocks
    root
      .find(j.CallExpression)
      .filter((path) => {
        const callee = path.value.callee;

        // Match global 'it'
        if (callee.type === 'Identifier' && callee.name === 'it') {
          return true; // Global `it`
        }

        return false;
      })
      .forEach(handleTestCallback);

    // find all it.each blocks
    root
      .find(j.CallExpression)
      .filter((path) => {
        const callee = path.value.callee;
        //
        if (callee.type === 'CallExpression') {
          const parentCallee = callee.callee;
          return (
            parentCallee?.type === 'MemberExpression' &&
            (parentCallee?.property as Identifier).name === 'each'
          );
        }

        if (callee.type === 'TaggedTemplateExpression') {
          const calleeTag = callee.tag;
          return (
            calleeTag?.type === 'MemberExpression' &&
            (calleeTag?.property as Identifier).name === 'each'
          );
        }

        return false;
      })
      .forEach(handleTestCallback);

    removeFireEventImport();

    return root.toSource({ quote: 'single', trailingComma: true });
  } catch (error) {
    console.error(`[ERROR] Transformation failed for file: ${file.path}`, error.message);
    return file.source; // Return the original source on error
  }
}
