/**
 * Core Requirements
 *
 * Import Management:
 * - Removes unused fireEvent imports from @testing-library/react
 * - Automatically cleans up import statements when fireEvent is no longer used
 * - Preserves other imports from @testing-library/react
 * - Adds userEvent import with ExtendedUserEvent type when needed
 *
 * Event Migration:
 * - Converts fireEvent methods to userEvent methods based on FIRE_EVENT_TO_USER_EVENT_MAP
 * - Handles special cases for change/input events with target.value
 * - Makes test callbacks async when needed
 * - Handles empty string inputs with user.clear() and number inputs with proper conversion
 *
 * Setup Function Handling:
 * - Supports multiple setup function names (SUPPORTED_RENDER_METHODS)
 * - Automatically adds user to destructured setup results
 * - Preserves existing destructuring patterns
 * - Handles direct awaits and variable declarations
 *
 * Test Block Processing:
 * - Processes both global it and it.each test blocks
 * - Makes test callbacks async when needed
 * - Preserves existing test structure and assertions
 * - Maintains test block context and scope
 *
 * Helper Function Processing:
 * - Identifies helper functions containing fireEvent calls
 * - Adds user parameter with ExtendedUserEvent type to these functions
 * - Makes helper functions async when they contain userEvent calls
 * - Updates all calls to helper functions to pass user parameter
 * - Adds await to calls of async helper functions
 *
 * Error Handling:
 * - Gracefully handles null/undefined AST nodes
 * - Validates AST node types before transformations
 * - Returns original source on transformation failure
 * - Provides debug logging for transformation steps
 */

import type {
  API,
  ArrowFunctionExpression,
  ASTPath,
  AwaitExpression,
  BlockStatement,
  CallExpression,
  Collection,
  Expression,
  FileInfo,
  FunctionExpression,
  Identifier,
  ImportSpecifier,
  JSCodeshift,
  MemberExpression,
  Node,
  ObjectPattern,
  Property,
  VariableDeclarator,
} from 'jscodeshift';

// Types
type Config = {
  j: JSCodeshift;
  root: Collection<Node>;
  filePath: string;
};

type FireEventMethod = keyof typeof FIRE_EVENT_TO_USER_EVENT_MAP;
type UserEventMethod = (typeof FIRE_EVENT_TO_USER_EVENT_MAP)[FireEventMethod] | 'clear';

// Constants
const BASE_RENDER_METHODS = ['renderWithReduxForm', 'renderWithRedux', 'renderWithTheme'] as const;

const POSSIBLE_SUPPORTED_RENDER_METHODS = [
  'setUp',
  'setup',
  'setupTest',
  ...BASE_RENDER_METHODS,
] as const;

const FIRE_EVENT_TO_USER_EVENT_MAP = {
  click: 'click',
  focus: 'click',
  mouseDown: 'click',
  mouseOver: 'hover',
  mouseEnter: 'hover',
  mouseOut: 'unhover',
  mouseMove: 'hover',
  blur: 'blur',
  change: 'advancedType',
  input: 'advancedType',
} as const;

// AST Utility Functions
const createAwaitExpression = (expression: any, config: Config): AwaitExpression => {
  return config.j.awaitExpression(expression);
};

const createMemberExpression = (
  object: Identifier,
  property: string,
  config: Config,
): MemberExpression => {
  return config.j.memberExpression(object, config.j.identifier(property));
};

const createUserEventCall = (
  method: UserEventMethod,
  args: any[],
  config: Config,
): AwaitExpression => {
  const userMember = createMemberExpression(config.j.identifier('user'), method, config);
  const callExpr = config.j.callExpression(userMember, args as any);
  return createAwaitExpression(callExpr, config);
};

// Special handling for creating user.type() call based on value type
const createUserEventTypeCall = (element: any, value: any, config: Config): AwaitExpression => {
  // Handle empty string - use clear instead of type
  if (value.value === '') {
    return createUserEventCall('clear', [element], config);
  }

  // Handle number - convert to string for type
  if (!isNaN(Number(value.value))) {
    return createUserEventCall(
      'advancedType',
      [element, config.j.stringLiteral(String(value.value))],
      config,
    );
  }

  // Default behavior for other values
  return createUserEventCall('advancedType', [element, value], config);
};

const createProperty = (key: string, value: any, shorthand: boolean, config: Config): Property => {
  return config.j.property.from({
    kind: 'init',
    key: config.j.identifier(key),
    value: value as any,
    shorthand,
  });
};

const createUserProperty = (config: Config): Property => {
  return createProperty('user', config.j.identifier('user'), true, config);
};

const createObjectPattern = (properties: Property[], config: Config): ObjectPattern => {
  return config.j.objectPattern(properties);
};

const createVariableDeclaration = (id: ObjectPattern, init: any, config: Config) => {
  return config.j.variableDeclaration('const', [config.j.variableDeclarator(id, init as any)]);
};

// Import Management
const removeFireEventImport = (config: Config) => {
  config.root
    .find(config.j.ImportDeclaration, {
      source: { value: '@testing-library/react' },
    })
    .forEach((path) => {
      if (!path?.value?.specifiers) return;

      const specifiers = path.value.specifiers as ImportSpecifier[];
      const fireEventSpecifier = specifiers.find(
        (specifier) => specifier.imported?.name === 'fireEvent',
      );

      if (fireEventSpecifier) {
        const fireEventIsUsed = config.root
          .find(config.j.Identifier, { name: 'fireEvent' })
          .some((identifierPath) => {
            const parentNode = identifierPath.parentPath.value;
            return parentNode.type !== 'ImportSpecifier';
          });

        if (!fireEventIsUsed) {
          specifiers.splice(specifiers.indexOf(fireEventSpecifier), 1);
          if (specifiers.length === 0) {
            config.j(path).remove();
          }
          console.log(`[DEBUG] Removed unused 'fireEvent' import from: ${config.filePath}`);
        }
      }
    });
};

// Target Value Utilities
const isTargetValueObject = (obj: any): boolean => {
  if (obj.type !== 'ObjectExpression') return false;

  return (obj as any).properties.some((prop: any) => {
    if (prop.type !== 'Property' && prop.type !== 'ObjectProperty') return false;
    return (
      prop.key &&
      prop.key.type === 'Identifier' &&
      prop.key.name === 'target' &&
      prop.value &&
      prop.value.type === 'ObjectExpression' &&
      prop.value.properties.some((innerProp: any) => {
        if (innerProp.type !== 'Property' && innerProp.type !== 'ObjectProperty') return false;
        return (
          innerProp.key && innerProp.key.type === 'Identifier' && innerProp.key.name === 'value'
        );
      })
    );
  });
};

const extractValueFromTarget = (obj: any): any => {
  const targetProperty = (obj as any).properties.find((prop: any) => {
    if (prop.type !== 'Property' && prop.type !== 'ObjectProperty') return false;
    return prop.key && prop.key.type === 'Identifier' && prop.key.name === 'target';
  });

  if (
    !targetProperty ||
    !(targetProperty as any).value ||
    (targetProperty as any).value.type !== 'ObjectExpression'
  ) {
    throw new Error('Invalid target property');
  }

  const valueProperty = (targetProperty as any).value.properties.find((innerProp: any) => {
    if (innerProp.type !== 'Property' && innerProp.type !== 'ObjectProperty') return false;
    return innerProp.key && innerProp.key.type === 'Identifier' && innerProp.key.name === 'value';
  });

  if (!valueProperty || !(valueProperty as any).value) {
    throw new Error('No value property found');
  }

  const value = (valueProperty as any).value;
  if (value.type !== 'StringLiteral' && value.type !== 'NumericLiteral') {
    throw new Error('Value must be a string or number literal');
  }

  return value;
};

// Event Handling
const replaceFireEventWithUserEvent = (
  blockBody: BlockStatement['body'],
  config: Config,
): boolean => {
  let hasReplacement = false;
  config
    .j(blockBody)
    .find(config.j.CallExpression, { callee: { object: { name: 'fireEvent' } } })
    .forEach((fireEventPath) => {
      if (!fireEventPath?.value?.callee) return;

      // Ensure callee is a MemberExpression
      if (fireEventPath.value.callee.type !== 'MemberExpression') return;

      const callee = fireEventPath.value.callee as MemberExpression;
      if (!callee.property || callee.property.type !== 'Identifier') return;

      const method = callee.property.name as FireEventMethod;
      const args = fireEventPath.value.arguments;
      const userEventMethod = FIRE_EVENT_TO_USER_EVENT_MAP[method];

      if (!userEventMethod) return;

      if ((method === 'change' || method === 'input') && args.length === 2) {
        const [element, secondArg] = args as [any, any];

        if (isTargetValueObject(secondArg) && secondArg.type === 'ObjectExpression') {
          try {
            const value = extractValueFromTarget(secondArg as any);
            config.j(fireEventPath).replaceWith(createUserEventTypeCall(element, value, config));
            hasReplacement = true;
          } catch (e) {
            console.error(`[ERROR] Failed to extract value from target: ${e.message}`);
          }
        }
      } else if (args.length === 1) {
        config
          .j(fireEventPath)
          .replaceWith(createUserEventCall(userEventMethod, args as any[], config));
        hasReplacement = true;
      }
    });

  if (hasReplacement) {
    console.log(`[DEBUG] Replaced fireEvent calls with userEvent in file: ${config.filePath}`);
  }
  return hasReplacement;
};

// Setup Function Handling
const handleDirectAwaitSetup = (
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

const handleVariableDeclaratorSetup = (
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

const getUserFromSetup = (blockBody: BlockStatement['body'], config: Config) => {
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

// Test Callback Handling
const addAsyncToCallback = (
  callback: FunctionExpression | ArrowFunctionExpression,
  config: Config,
) => {
  if (!callback.async) {
    callback.async = true;
    console.log(`[DEBUG] Made callback async in file: ${config.filePath}`);
  }
};

const handleTestCallback = (callbackPath: ASTPath<CallExpression>, config: Config) => {
  if (!callbackPath?.value?.arguments?.[1]) return;

  const callback = callbackPath.value.arguments[1];
  if (callback.type !== 'FunctionExpression' && callback.type !== 'ArrowFunctionExpression') return;

  const body = callback.body.type === 'BlockStatement' ? callback.body.body : [];
  if (!Array.isArray(body)) return;

  const hasFireEventReplacement = replaceFireEventWithUserEvent(body, config);

  // Identify helper function calls in test blocks and update them to pass the user parameter
  const modifiedHelperFunctionCalls = identifyAndUpdateHelperFunctionCalls(body, config);

  // Only proceed with additional changes if we replaced fireEvent or updated helper functions
  if (!hasFireEventReplacement && !modifiedHelperFunctionCalls) return;

  getUserFromSetup(body, config);
  addAsyncToCallback(callback, config);
};

// Helper Function Processing
const identifyAndUpdateHelperFunctionCalls = (
  blockBody: BlockStatement['body'],
  config: Config,
): boolean => {
  let hasUpdated = false;

  // Get all function names that have user parameter
  const modifiedFunctionNames = new Set<string>();

  // Find all function declarations with user parameter
  config.root
    .find(config.j.FunctionDeclaration)
    .filter((path) => {
      return path.value.params.some(
        (param) => param.type === 'Identifier' && param.name === 'user',
      );
    })
    .forEach((path) => {
      if (path.value.id && path.value.id.name) {
        modifiedFunctionNames.add(path.value.id.name);
      }
    });

  // Find all variable declarations with user parameter
  config.root
    .find(config.j.VariableDeclarator)
    .filter((path) => {
      const func = path.value.init;
      return (
        func &&
        (func.type === 'FunctionExpression' || func.type === 'ArrowFunctionExpression') &&
        func.params.some((param) => param.type === 'Identifier' && param.name === 'user')
      );
    })
    .forEach((path) => {
      if (path.value.id && path.value.id.type === 'Identifier') {
        modifiedFunctionNames.add(path.value.id.name);
      }
    });

  // Update function calls within the test block
  if (modifiedFunctionNames.size > 0) {
    config
      .j(blockBody)
      .find(config.j.CallExpression, {
        callee: {
          type: 'Identifier',
          name: (name) => modifiedFunctionNames.has(name),
        },
      })
      .forEach((path) => {
        // Add user parameter if not already present
        if (!path.value.arguments.some((arg) => arg.type === 'Identifier' && arg.name === 'user')) {
          path.value.arguments.push(config.j.identifier('user'));
          hasUpdated = true;
          console.log(
            `[DEBUG] Added user parameter to helper function call in test block in ${config.filePath}`,
          );
        }
      });
  }

  return hasUpdated;
};

const createUserTypeAnnotation = (config: Config) => {
  return config.j.tsTypeAnnotation(
    config.j.tsTypeReference(config.j.identifier('ExtendedUserEvent')),
  );
};

const isSetupFunction = (name: string): boolean => {
  return POSSIBLE_SUPPORTED_RENDER_METHODS.includes(name as any);
};

// Helper function to detect and modify independent helper functions
const handleHelperFunctions = (config: Config): boolean => {
  let modifiedAnyFunction = false;

  // Find all function declarations
  config.root
    .find(config.j.FunctionDeclaration)
    .filter((path) => {
      // Exclude setup functions
      if (path.value.id && isSetupFunction(path.value.id.name)) {
        return false;
      }

      // Check if the function contains fireEvent calls
      return (
        config
          .j(path)
          .find(config.j.CallExpression, { callee: { object: { name: 'fireEvent' } } })
          .size() > 0
      );
    })
    .forEach((path) => {
      // Add user parameter if not already present
      const userParamExists = path.value.params.some(
        (param) => param.type === 'Identifier' && param.name === 'user',
      );

      if (!userParamExists) {
        // Create a new identifier parameter with type annotation
        const userParam = config.j.identifier('user');
        userParam.typeAnnotation = createUserTypeAnnotation(config);

        // Add the parameter to the function
        path.value.params.push(userParam);

        // Replace fireEvent calls with user event calls within the function
        let containsUserEventCalls = false;
        if (path.value.body && path.value.body.type === 'BlockStatement') {
          containsUserEventCalls = replaceFireEventWithUserEvent(path.value.body.body, config);
        }

        // Make the function async if it contains userEvent calls
        if (containsUserEventCalls && !path.value.async) {
          path.value.async = true;
          console.log(
            `[DEBUG] Made helper function async: ${path.value.id?.name || 'anonymous'} in ${config.filePath}`,
          );
        }

        // Safely log the function name if it exists
        const functionName = path.value.id?.name || 'anonymous';
        console.log(
          `[DEBUG] Added user parameter to helper function: ${functionName} in ${config.filePath}`,
        );

        modifiedAnyFunction = true;
      }
    });

  // Find all variable declarations that are assigned a function
  config.root
    .find(config.j.VariableDeclarator, {
      init: {
        type: (node) => node === 'FunctionExpression' || node === 'ArrowFunctionExpression',
      },
    })
    .filter((path) => {
      // Exclude setup functions
      if (
        path.value.id &&
        path.value.id.type === 'Identifier' &&
        isSetupFunction(path.value.id.name)
      ) {
        return false;
      }

      // Check if the function contains fireEvent calls
      return (
        path.value.init &&
        config
          .j(path.value.init)
          .find(config.j.CallExpression, { callee: { object: { name: 'fireEvent' } } })
          .size() > 0
      );
    })
    .forEach((path) => {
      const func = path.value.init as FunctionExpression | ArrowFunctionExpression;

      // Add user parameter if not already present
      const userParamExists = func.params.some(
        (param) => param.type === 'Identifier' && param.name === 'user',
      );

      if (!userParamExists) {
        // Create a new identifier parameter with type annotation
        const userParam = config.j.identifier('user');
        userParam.typeAnnotation = createUserTypeAnnotation(config);

        // Add the parameter to the function
        func.params.push(userParam);

        // Replace fireEvent calls with user event calls within the function
        let containsUserEventCalls = false;
        if (func.body && func.body.type === 'BlockStatement') {
          containsUserEventCalls = replaceFireEventWithUserEvent(func.body.body, config);
        }

        // Make the function async if it contains userEvent calls
        if (containsUserEventCalls && !func.async) {
          func.async = true;

          let functionName = 'anonymous';
          if (path.value.id && path.value.id.type === 'Identifier') {
            functionName = path.value.id.name;
          }

          console.log(`[DEBUG] Made helper function async: ${functionName} in ${config.filePath}`);
        }

        // Safely log the variable name if it exists
        let variableName = 'anonymous';
        if (path.value.id && path.value.id.type === 'Identifier') {
          variableName = path.value.id.name;
        }
        console.log(
          `[DEBUG] Added user parameter to helper function: ${variableName} in ${config.filePath}`,
        );

        modifiedAnyFunction = true;
      }
    });

  if (modifiedAnyFunction) {
    // Update function calls to pass user parameter
    updateHelperFunctionCalls(config);
  }

  return modifiedAnyFunction;
};

// Function to update calls to helper functions
const updateHelperFunctionCalls = (config: Config) => {
  // Get all function names that were modified
  const modifiedFunctionNames = new Set<string>();
  const asyncFunctionNames = new Set<string>();

  // Find all function declarations with user parameter
  config.root
    .find(config.j.FunctionDeclaration)
    .filter((path) => {
      return path.value.params.some(
        (param) => param.type === 'Identifier' && param.name === 'user',
      );
    })
    .forEach((path) => {
      if (path.value.id && path.value.id.name) {
        modifiedFunctionNames.add(path.value.id.name);

        // Track which functions are async
        if (path.value.async) {
          asyncFunctionNames.add(path.value.id.name);
        }
      }
    });

  // Find all variable declarations with user parameter
  config.root
    .find(config.j.VariableDeclarator)
    .filter((path) => {
      const func = path.value.init;
      return (
        func &&
        (func.type === 'FunctionExpression' || func.type === 'ArrowFunctionExpression') &&
        func.params.some((param) => param.type === 'Identifier' && param.name === 'user')
      );
    })
    .forEach((path) => {
      if (path.value.id && path.value.id.type === 'Identifier') {
        modifiedFunctionNames.add(path.value.id.name);

        // Track which functions are async
        const func = path.value.init as FunctionExpression | ArrowFunctionExpression;
        if (func.async) {
          asyncFunctionNames.add(path.value.id.name);
        }
      }
    });

  // Find and update call expressions to those functions
  modifiedFunctionNames.forEach((functionName) => {
    config.root
      .find(config.j.CallExpression, {
        callee: {
          type: 'Identifier',
          name: functionName,
        },
      })
      .forEach((path) => {
        let modified = false;

        // Add user parameter if not already present
        if (!path.value.arguments.some((arg) => arg.type === 'Identifier' && arg.name === 'user')) {
          path.value.arguments.push(config.j.identifier('user'));
          modified = true;
        }

        // Add await if the function is async and not already awaited
        if (asyncFunctionNames.has(functionName)) {
          // Check if this call is already in an await expression
          const isAlreadyAwaited = path.parent.value.type === 'AwaitExpression';

          if (!isAlreadyAwaited) {
            // Create new await expression
            const awaitExpression = createAwaitExpression(path.value, config);

            // Replace the call expression with await expression
            config.j(path).replaceWith(awaitExpression);

            console.log(
              `[DEBUG] Added await to helper function call: ${functionName} in ${config.filePath}`,
            );
            modified = true;
          }
        }

        if (modified) {
          console.log(
            `[DEBUG] Updated call to helper function: ${functionName} in ${config.filePath}`,
          );
        }
      });
  });
};

// Function to add import for userEvent and ExtendedUserEvent
const addUserEventImport = (shouldImportExtendedUserEvent: boolean, config: Config) => {
  if (!shouldImportExtendedUserEvent) {
    return;
  }

  // Check for existing userEvent import
  const userEventImport = config.root.find(config.j.ImportDeclaration, {
    source: {
      value: '@testing-library/user-event',
    },
  });

  if (userEventImport.size() > 0) {
    // Import exists, check if 'ExtendedUserEvent' is imported
    const extendedUserEventTypeImport = userEventImport.find(config.j.ImportSpecifier, {
      imported: {
        name: 'ExtendedUserEvent',
      },
    });

    if (extendedUserEventTypeImport.size() === 0) {
      // 'ExtendedUserEvent' is not imported, add it
      // Create a specifier for ExtendedUserEvent
      const importSpecifier = config.j.importSpecifier(config.j.identifier('ExtendedUserEvent'));

      // Create a node property for storing the importKind
      // @ts-expect-error - importKind is valid but not in types
      importSpecifier.importKind = 'type';

      const importDeclaration = userEventImport.get().node;
      importDeclaration.specifiers.push(importSpecifier);
    }
  } else {
    // No existing import, create a new one
    // Create a specifier for ExtendedUserEvent
    const importSpecifier = config.j.importSpecifier(config.j.identifier('ExtendedUserEvent'));

    // Create a node property for storing the importKind
    // @ts-expect-error - importKind is valid but not in types
    importSpecifier.importKind = 'type';

    const newImport = config.j.importDeclaration(
      [importSpecifier],
      config.j.literal('@testing-library/user-event'),
    );

    // find the first import statement, insert new import declaration before it
    const firstImport = config.root.find(config.j.ImportDeclaration).at(0);
    if (firstImport.size() > 0) {
      firstImport.insertBefore(newImport);
    } else {
      // No existing import statements, insert at the top of the file
      config.root.get().node.body.unshift(newImport);
    }
  }
};

// Main Transformer
export default function transformer(file: FileInfo, api: API) {
  const j = api.jscodeshift;
  const root = j(file.source);
  const config: Config = { j, root, filePath: file.path };

  try {
    console.log(`[DEBUG] Transforming file: ${file.path}`);

    // First, detect if there are any helper functions that use fireEvent
    const hasHelperFunctionsWithFireEvent = handleHelperFunctions(config);

    // Add userEvent import (with ExtendedUserEvent type if helper functions were found)
    addUserEventImport(hasHelperFunctionsWithFireEvent, config);

    // Process global 'it' tests
    root
      .find(j.CallExpression)
      .filter((path) => path.value.callee.type === 'Identifier' && path.value.callee.name === 'it')
      .forEach((path) => handleTestCallback(path, config));

    // Process 'it.each' tests
    root
      .find(j.CallExpression)
      .filter((path) => {
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
      })
      .forEach((path) => handleTestCallback(path, config));

    removeFireEventImport(config);

    return root.toSource({ quote: 'single', trailingComma: true });
  } catch (error) {
    console.error(`[ERROR] Transformation failed for file: ${file.path}`, error.message);
    return file.source;
  }
}
