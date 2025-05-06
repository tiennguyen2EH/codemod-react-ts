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

import type { API, FileInfo } from 'jscodeshift';

// Import all utils from the utils directory
import {
  Config,
  addUserEventImport,
  handleHelperFunctions,
  handleTestCallback,
  isSetupFunction,
  removeFireEventImport,
  replaceFireEventWithUserEvent,
} from './fire_event_to_user_event_utils';
import {
  findAllItEachTestBlocks,
  findAllSkippedTestBlocks,
  findAllTestBlocks,
  prefixUserEventWithView,
} from './shared';

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

    // Process all test blocks and apply user event prefix
    findAllTestBlocks(config).forEach((path) => {
      handleTestCallback(path, config);
    });

    // Process 'it.skip' and 'test.skip' tests
    findAllSkippedTestBlocks(config).forEach((path) => {
      handleTestCallback(path, config);
    });

    findAllItEachTestBlocks(config).forEach((path) => {
      handleTestCallback(path, config);
    });

    // Process setup functions that has fireEvent calls inside
    root
      .find(j.VariableDeclaration)
      .filter(
        (path) =>
          path.value.declarations[0].type === 'VariableDeclarator' &&
          path.value.declarations[0].id.type === 'Identifier' && // Add type check
          isSetupFunction(path.value.declarations[0].id.name),
      )
      .forEach((path) => {
        const declaration = path.value.declarations[0] as any;
        if (
          !declaration.init ||
          !declaration.init.body ||
          declaration.init.body.type !== 'BlockStatement'
        )
          return;

        const body = declaration.init.body.body;
        if (!Array.isArray(body)) return;

        replaceFireEventWithUserEvent(body, config);
        prefixUserEventWithView(body, config);
      });

    removeFireEventImport(config);

    return root.toSource({ quote: 'single', trailingComma: true });
  } catch (error) {
    console.error(`[ERROR] Transformation failed for file: ${file.path}`, error.message);
    return file.source;
  }
}
