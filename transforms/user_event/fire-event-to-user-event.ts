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
  JSCodeshift,
  Collection,
  Node,
  FunctionExpression,
  ArrowFunctionExpression,
  ObjectPattern,
  Property,
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
  blur: 'blur',
  change: 'advancedType',
  input: 'advancedType',
} as const;

// Utility Functions
const createUserEventCall = (method: UserEventMethod, args: any[], config: Config) => {
  return config.j.awaitExpression(
    config.j.callExpression(
      config.j.memberExpression(config.j.identifier('user'), config.j.identifier(method)),
      args,
    ),
  );
};

// Special handling for creating user.type() call based on value type
const createUserEventTypeCall = (element: any, value: any, config: Config) => {
  // Handle empty string - use clear instead of type
  if (value.value === '') {
    return createUserEventCall('clear', [element], config);
  }

  // Handle number - convert to string for type
  if (!isNaN(value.value)) {
    return createUserEventCall(
      'advancedType',
      [element, config.j.stringLiteral(String(value.value))],
      config,
    );
  }

  // Default behavior for other values
  return createUserEventCall('advancedType', [element, value], config);
};

const createUserProperty = (config: Config): Property => {
  return config.j.property.from({
    kind: 'init',
    key: config.j.identifier('user'),
    value: config.j.identifier('user'),
    shorthand: true,
  });
};

const createObjectPattern = (properties: Property[], config: Config): ObjectPattern => {
  return config.j.objectPattern(properties);
};

const createVariableDeclaration = (id: ObjectPattern, init: any, config: Config) => {
  return config.j.variableDeclaration('const', [config.j.variableDeclarator(id, init)]);
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

// Event Handling
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

const replaceFireEventWithUserEvent = (blockBody: BlockStatement['body'], config: Config) => {
  let hasReplacement = false;
  config
    .j(blockBody)
    .find(config.j.CallExpression, { callee: { object: { name: 'fireEvent' } } })
    .forEach((fireEventPath) => {
      if (!fireEventPath?.value?.callee) return;

      // Ensure callee is a MemberExpression
      if (fireEventPath.value.callee.type !== 'MemberExpression') return;

      const callee = fireEventPath.value.callee;
      if (!callee.property || callee.property.type !== 'Identifier') return;

      const method = callee.property.name as FireEventMethod;
      const args = fireEventPath.value.arguments;
      const userEventMethod = FIRE_EVENT_TO_USER_EVENT_MAP[method];

      if (!userEventMethod) return;

      if ((method === 'change' || method === 'input') && args.length === 2) {
        const [element, secondArg] = args;

        if (isTargetValueObject(secondArg)) {
          const value = extractValueFromTarget(secondArg);

          config.j(fireEventPath).replaceWith(createUserEventTypeCall(element, value, config));
          hasReplacement = true;
        }
      } else if (args.length === 1) {
        config.j(fireEventPath).replaceWith(createUserEventCall(userEventMethod, args, config));
        hasReplacement = true;
      }
    });

  if (hasReplacement) {
    console.log(`[DEBUG] Replaced fireEvent calls with userEvent in file: ${config.filePath}`);
  }
  return hasReplacement;
};

// Setup Function Handling
const handleDirectAwaitSetup = (parentPath: ASTPath<any>, setupCall: any, config: Config) => {
  const userPattern = createObjectPattern([createUserProperty(config)], config);
  config
    .j(parentPath)
    .replaceWith(
      createVariableDeclaration(userPattern, config.j.awaitExpression(setupCall), config),
    );
};

const handleVariableDeclaratorSetup = (
  declarator: any,
  setupCall: any,
  isAwaited: boolean,
  config: Config,
) => {
  if (declarator.id.type === 'ObjectPattern') {
    const userExists = declarator.id.properties.some((prop) => prop.key.name === 'user');
    if (!userExists) {
      declarator.id.properties.push(createUserProperty(config));
    }
  } else {
    declarator.id = createObjectPattern(
      [
        createUserProperty(config),
        config.j.property.from({
          kind: 'init',
          key: declarator.id,
          value: declarator.id,
          shorthand: true,
        }),
      ],
      config,
    );
  }
  declarator.init = isAwaited ? config.j.awaitExpression(setupCall) : setupCall;
};

const getUserFromSetup = (blockBody: BlockStatement['body'], config: Config) => {
  config
    .j(blockBody)
    .find(config.j.CallExpression, {
      callee: {
        type: 'Identifier',
        name: (name) => POSSIBLE_SUPPORTED_RENDER_METHODS.includes(name),
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
              isAwaited ? config.j.awaitExpression(setupCall) : setupCall,
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
  if (!hasFireEventReplacement) return;

  getUserFromSetup(body, config);
  addAsyncToCallback(callback, config);
};

// Main Transformer
export default function transformer(file: FileInfo, api: API) {
  const j = api.jscodeshift;
  const root = j(file.source);
  const config: Config = { j, root, filePath: file.path };

  try {
    console.log(`[DEBUG] Transforming file: ${file.path}`);

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
