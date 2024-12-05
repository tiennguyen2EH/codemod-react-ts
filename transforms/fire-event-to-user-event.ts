import type { API, BlockStatement, FileInfo, Identifier, ImportSpecifier } from 'jscodeshift';

export default function transformer(file: FileInfo, api: API) {
  const j = api.jscodeshift;
  const root = j(file.source);

  const removeFireEventImport = () => {
    root
      .find(j.ImportDeclaration, {
        source: { value: '@testing-library/react' },
      })
      .forEach((path) => {
        if (!path || !path.value || !path.value.specifiers) return; // Guard against null

        const specifiers = path.value.specifiers as ImportSpecifier[];

        const fireEventSpecifierIndex = specifiers.findIndex(
          (specifier) => specifier.imported && specifier.imported.name === 'fireEvent',
        );

        if (fireEventSpecifierIndex !== -1) {
          // Remove the specific 'fireEvent' specifier
          specifiers.splice(fireEventSpecifierIndex, 1);

          // If no specifiers remain, remove the entire ImportDeclaration
          if (specifiers.length === 0) {
            j(path).remove();
          }

          console.log(`[DEBUG] Removed 'fireEvent' import from: ${file.path}`);
        }
      });
  };

  const replaceFireEventWithUserEvent = (blockBody: BlockStatement['body']) => {
    let hasReplacement = false;
    j(blockBody)
      .find(j.CallExpression, { callee: { object: { name: 'fireEvent' } } })
      .forEach((fireEventPath) => {
        if (!fireEventPath || !fireEventPath.value) return; // Guard against null/undefined fireEventPath

        if (fireEventPath.value.callee.type !== 'MemberExpression') {
          return;
        }

        const callee = fireEventPath.value.callee;

        if (callee.property.type !== 'Identifier') {
          return;
        }

        const method = callee.property.name; // Get the method name (click, change, etc.)
        const args = fireEventPath.value.arguments;

        // Handle fireEvent.click(<ele>)
        if (method === 'click' && args.length === 1) {
          j(fireEventPath).replaceWith(
            j.awaitExpression(
              j.callExpression(
                j.memberExpression(j.identifier('user'), j.identifier('click')),
                args,
              ),
            ),
          );
          hasReplacement = true;
        }

        // Handle fireEvent.mouseOver(<ele>)
        if (method === 'mouseOver' && args.length === 1) {
          j(fireEventPath).replaceWith(
            j.awaitExpression(
              j.callExpression(
                j.memberExpression(j.identifier('user'), j.identifier('hover')),
                args,
              ),
            ),
          );
          hasReplacement = true;
        }

        // Handle fireEvent.change(<ele>, { target: { value: <value> } })
        if (method === 'change' && args.length === 2) {
          const [element, secondArg] = args;

          // Ensure the second argument is an object expression with target -> value
          if (
            secondArg.type === 'ObjectExpression' &&
            secondArg.properties.some(
              (prop: any) =>
                prop.key.type === 'Identifier' &&
                prop.key.name === 'target' &&
                prop.value.type === 'ObjectExpression' &&
                prop.value.properties.some(
                  (innerProp) =>
                    innerProp.key.type === 'Identifier' && innerProp.key.name === 'value',
                ),
            )
          ) {
            // Extract the value from target.value
            const targetProperty: any = secondArg.properties.find(
              (prop: any) => prop.key.name === 'target',
            );

            const valueProperty = targetProperty.value.properties.find(
              (innerProp) => innerProp.key.name === 'value',
            );

            const value = valueProperty.value; // Extract the value node

            j(fireEventPath).replaceWith(
              j.awaitExpression(
                j.callExpression(
                  j.memberExpression(j.identifier('user'), j.identifier('type')),
                  [element, value], // Use the extracted <ele> and <value>
                ),
              ),
            );
            hasReplacement = true;
          }
        }
      });
    if (hasReplacement) {
      console.log(
        `[DEBUG] Replaced 'fireEvent.click' with 'await user.click' in file: ${file.path}`,
      );
      console.log(
        `[DEBUG] Replaced 'fireEvent.change' with 'await user.type' in file: ${file.path}`,
      );
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
    const setupMethods = ['setUp', 'setup'];

    j(blockBody)
      .find(j.CallExpression, {
        callee: { type: 'Identifier', name: (name) => setupMethods.includes(name) },
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
                j.property('init', j.identifier('user'), j.identifier('user')),
              );
            }
          } else {
            // Replace simple variable assignment with destructuring
            declarator.id = j.objectPattern([
              j.property('init', j.identifier('user'), j.identifier('user')),
            ]);
          }
        } else {
          // If setup is not part of a variable declaration, add a new destructuring
          j(setupPath).replaceWith(
            j.variableDeclaration('const', [
              j.variableDeclarator(
                j.objectPattern([j.property('init', j.identifier('user'), j.identifier('user'))]),
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

  try {
    console.log(`[DEBUG] Transforming file: ${file.path}`);

    // Find all jest.it blocks
    // Find all jest.it or global it blocks
    root
      .find(j.CallExpression)
      .filter((path) => {
        const callee = path.value.callee;

        // Match 'it' or 'jest.it'
        if (path.value.callee.type === 'Identifier' && path.value.callee.name === 'it') {
          return true; // Global `it`
        }
        if (
          callee.type === 'MemberExpression' &&
          (callee as any).computed === 'jest' &&
          (callee as any).property.name === 'it'
        ) {
          return true; // `jest.it`
        }
        return false;
      })
      .forEach((itPath) => {
        if (!itPath || !itPath.value || !itPath.value.arguments) return; // Guard against null/undefined itPath

        const callback = itPath.value.arguments[1];
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
      });

    // removeFireEventImport();

    return root.toSource({ quote: 'single', trailingComma: true });
  } catch (error) {
    console.error(`[ERROR] Transformation failed for file: ${file.path}`, error.message);
    return file.source; // Return the original source on error
  }
}
