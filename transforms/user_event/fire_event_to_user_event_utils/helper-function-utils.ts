import type { BlockStatement, FunctionExpression, ArrowFunctionExpression } from 'jscodeshift';
import { Config } from './types';
import { POSSIBLE_SUPPORTED_RENDER_METHODS } from './constants';
import { createUserTypeAnnotation, replaceFireEventWithUserEvent } from './event-utils';
import { prefixUserEventWithView } from '../shared';

// Helper Function Processing
export const isSetupFunction = (name: string): boolean => {
  return POSSIBLE_SUPPORTED_RENDER_METHODS.includes(name as any);
};

// Helper function to detect and modify independent helper functions
export const handleHelperFunctions = (config: Config): boolean => {
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
          prefixUserEventWithView(path.value.body.body, config);
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
          prefixUserEventWithView(func.body.body, config);
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
export const updateHelperFunctionCalls = (config: Config) => {
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
            const awaitExpression = config.j.awaitExpression(path.value);

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

// Helper function to identify and update helper function calls in test blocks
export const identifyAndUpdateHelperFunctionCalls = (
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
