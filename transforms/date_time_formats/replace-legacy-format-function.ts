/**
 * Core Requirements
 *
 * Import Management:
 * - Removes unused legacy format imports from 'eh-utils/time/format'
 * - Automatically cleans up import statements when legacy functions are no longer used
 * - Preserves other imports from 'eh-utils/time/format'
 * - Adds new imports from 'eh-utils/time/format/formatters'
 *
 * Function Migration:
 * - Converts legacy format functions to new format functions based on LEGACY_TO_NEW_FORMAT_MAP
 * - Adds the newOptions parameter to the function call
 * - Preserves the first parameter (the value to format)
 * - Merges any existing options from legacy function calls with the new options
 *
 * Error Handling:
 * - Gracefully handles null/undefined AST nodes
 * - Validates AST node types before transformations
 * - Returns original source on transformation failure
 * - Provides debug logging for transformation steps
 */

import type {
  API,
  FileInfo,
  ImportSpecifier,
  CallExpression,
  ASTPath,
  JSCodeshift,
  Collection,
  Node,
} from 'jscodeshift';

// Types
type Config = {
  j: JSCodeshift;
  root: Collection<Node>;
  filePath: string;
};

type LegacyFunctionName = keyof typeof LEGACY_TO_NEW_FORMAT_MAP;

// Constants
const LEGACY_TO_NEW_FORMAT_MAP = {
  formatDate: {
    newFunctionName: 'formatDate',
    newOptions: { formatType: 'date.short' },
  },
  formatDateTime: {
    newFunctionName: 'formatDateTime',
    newOptions: { dateStyle: 'short', timeStyle: 'long12h' },
  },
  formatCompactDateWithoutYear: {
    newFunctionName: 'formatDate',
    newOptions: { formatType: 'dayMonth.medium' },
  },
  formatCompactDateWithWeekdayWithoutYear: {
    newFunctionName: 'formatDate',
    newOptions: { formatType: 'dayMonth.medium', weekday: 'short' },
  },
  formatLongDate: {
    newFunctionName: 'formatDate',
    newOptions: { formatType: 'date.medium' },
  },
  formatNormalLongDate: {
    newFunctionName: 'formatDate',
    newOptions: { formatType: 'date.long' },
  },
  formatLongDateTime: {
    newFunctionName: 'formatDateTime',
    newOptions: { dateStyle: 'medium', timeStyle: 'short12h' },
  },
  formatOrdinalLongDate: {
    newFunctionName: 'formatDate',
    newOptions: { formatType: 'ordinalDate.long' },
  },
  formatOrdinalMediumDate: {
    newFunctionName: 'formatDate',
    newOptions: { formatType: 'ordinalDate.medium' },
  },
  formatDayOfWeek: {
    newFunctionName: 'formatDate',
    newOptions: { formatType: 'weekday.long' },
  },
  formatTime: {
    newFunctionName: 'formatDate',
    newOptions: { formatType: 'time.long12h' },
  },
  formatTimeWithoutSecond: {
    newFunctionName: 'formatDate',
    newOptions: { formatType: 'time.short12h' },
  },
  formatLongDateTimeWithSecond: {
    newFunctionName: 'formatDateTime',
    newOptions: { dateStyle: 'medium', timeStyle: 'long12h' },
  },
  formatTimeWithoutSecondWithCapitalizeFormat: {
    newFunctionName: 'formatDate',
    newOptions: { formatType: 'time.short12hCapitalized' },
  },
  formatShortTimeWithoutSecond: {
    newFunctionName: 'formatDate',
    newOptions: { formatType: 'time.short12hCapitalized' },
  },
  formatDateTimeWithoutSeconds: {
    newFunctionName: 'formatDateTime',
    newOptions: {
      dateStyle: 'short',
      timeStyle: 'short12hCapitalized',
    },
  },
  formatTimeAndDate: {
    newFunctionName: 'formatDateTime',
    newOptions: { timeStyle: 'short24h', dateStyle: 'short' },
  },
  formatTimeAndDateUsing12Hours: {
    newFunctionName: 'formatDateTime',
    newOptions: {
      timeStyle: 'short12hCapitalized',
      dateStyle: 'short',
    },
  },
  formatTimezoneOffset: {
    newFunctionName: 'formatDate',
    newOptions: { formatType: 'timeZone.offset' },
  },
  formatDateTimeWithCapitalizeFormat: {
    newFunctionName: 'formatDateTime',
    newOptions: {
      dateStyle: 'short',
      timeStyle: 'long12hCapitalized',
    },
  },
  formatTimeWithCapitalizeFormat: {
    newFunctionName: 'formatDate',
    newOptions: { formatType: 'time.long12hCapitalized' },
  },
  formatLongDayMonth: {
    newFunctionName: 'formatDate',
    newOptions: { formatType: 'dayMonth.medium' },
  },
  formatDateWithWeekDay: {
    newFunctionName: 'formatDate',
    newOptions: { formatType: 'date.short', weekday: 'short' },
  },
  formatLongDayMonthWithWeekDay: {
    newFunctionName: 'formatDate',
    newOptions: { formatType: 'dayMonth.medium', weekday: 'short' },
  },
  formatLongDateWithWeekday: {
    newFunctionName: 'formatDate',
    newOptions: { formatType: 'date.medium', weekday: 'short' },
  },
} as const;

// AST creation utilities
const astUtils = {
  createProperty: (j: JSCodeshift, key: string, value: string | number | boolean | object) => {
    if (typeof value === 'string') {
      return j.property('init', j.identifier(key), j.stringLiteral(value));
    } else if (typeof value === 'number') {
      return j.property('init', j.identifier(key), j.numericLiteral(value));
    } else if (typeof value === 'boolean') {
      return j.property('init', j.identifier(key), j.booleanLiteral(value));
    } else if (typeof value === 'object' && value !== null) {
      return j.property(
        'init',
        j.identifier(key),
        j.objectExpression(
          Object.entries(value).map(([subKey, subValue]) =>
            astUtils.createProperty(j, subKey, subValue as unknown as string | number | boolean),
          ),
        ),
      );
    } else {
      // Fallback for other types
      return j.property(
        'init',
        j.identifier(key),
        j.literal(value as unknown as string | number | boolean),
      );
    }
  },

  createObjectExpression: (
    j: JSCodeshift,
    properties: Record<string, string | number | boolean | object>,
  ) => {
    return j.objectExpression(
      Object.entries(properties).map(([key, value]) => astUtils.createProperty(j, key, value)),
    );
  },
};

// Logger with standardized format
const logger = {
  debug: (message: string, ...args: any[]) => {
    console.log(`[DEBUG] ${message}`, ...args);
  },
  warn: (message: string, ...args: any[]) => {
    console.warn(`[WARN] ${message}`, ...args);
  },
  error: (message: string, error: Error | string) => {
    console.error(`[ERROR] ${message}`, error);
  },
};

/**
 * Extracts the second argument from a function call
 */
const extractSecondArgument = (
  path: ASTPath<CallExpression>,
  config: Config,
): Record<string, unknown> | string | undefined => {
  if (path.value.arguments.length < 2) {
    return undefined; // No second argument
  }

  const secondArg = path.value.arguments[1];

  // Convert AST node to a JavaScript value
  if (secondArg.type === 'ObjectExpression') {
    return secondArg.properties.reduce((acc, prop) => {
      if (
        (prop.type === 'Property' || prop.type === 'ObjectProperty') &&
        prop.key.type === 'Identifier'
      ) {
        acc[prop.key.name] = (prop.value as any).value;
      }
      return acc;
    }, {});
  }

  if (secondArg.type === 'Identifier') {
    return secondArg.name; // Return variable name as string
  }

  return undefined;
};

/**
 * Creates a new format function call to replace the legacy one
 */
const createNewFormatCall = (
  newFunctionName: string,
  args: any[],
  newOptions: Record<string, string | number | boolean>,
  config: Config,
  legacyOptions?: Record<string, any> | string,
) => {
  const { j } = config;

  // If legacyOptions is a string (variable name),
  // we can't statically resolve it, so we use spread operator
  if (typeof legacyOptions === 'string') {
    return j.callExpression(j.identifier(newFunctionName), [
      args[0], // Keep the first argument (the value to format)
      j.objectExpression([
        // Spread the original options variable
        j.spreadElement(j.identifier(legacyOptions)),
        // Add the new options as separate properties
        ...Object.entries(newOptions).map(([key, value]) => astUtils.createProperty(j, key, value)),
      ]),
    ]);
  }

  // Normal case - merge object options
  const mergedOptions =
    legacyOptions && typeof legacyOptions === 'object'
      ? { ...legacyOptions, ...newOptions }
      : newOptions;

  return j.callExpression(j.identifier(newFunctionName), [
    // Keep only the first argument (the value to format)
    args[0],
    astUtils.createObjectExpression(j, mergedOptions),
  ]);
};

/**
 * Handles import statements for legacy and new format functions
 */
const handleImports = (config: Config) => {
  const { j, root } = config;

  // Track which legacy functions are used
  const usedLegacyFunctions = new Set<string>();

  root.find(j.Identifier).forEach((path) => {
    const name = path.value.name;
    if (name in LEGACY_TO_NEW_FORMAT_MAP) {
      usedLegacyFunctions.add(name);
    }
  });

  // No used legacy functions means no work to do
  if (usedLegacyFunctions.size === 0) {
    return;
  }

  // Remove legacy imports
  removeLegacyImports(config, usedLegacyFunctions);

  // Add new imports
  addNewImports(config, usedLegacyFunctions);
};

/**
 * Removes legacy format imports
 */
const removeLegacyImports = (config: Config, usedLegacyFunctions: Set<string>) => {
  const { j, root, filePath } = config;

  root
    .find(j.ImportDeclaration, {
      source: { value: 'eh-utils/time/format' },
    })
    .forEach((path) => {
      if (!path?.value?.specifiers) return;

      const specifiers = path.value.specifiers as ImportSpecifier[];
      const legacySpecifiers = specifiers.filter(
        (specifier) =>
          specifier.type === 'ImportSpecifier' &&
          specifier.imported &&
          specifier.imported.name in LEGACY_TO_NEW_FORMAT_MAP,
      );

      if (legacySpecifiers.length > 0) {
        // Remove legacy specifiers
        legacySpecifiers.forEach((specifier) => {
          const index = specifiers.indexOf(specifier);
          if (index !== -1) {
            specifiers.splice(index, 1);
          }
        });

        // If no specifiers left, remove the entire import
        if (specifiers.length === 0) {
          j(path).remove();
        }

        logger.debug(`Removed legacy format imports from: ${filePath}`);
      }
    });
};

/**
 * Adds new format imports
 */
const addNewImports = (config: Config, usedLegacyFunctions: Set<string>) => {
  const { j, root, filePath } = config;

  // Get all new function names that need to be imported
  const newFunctionNames = new Set<string>();

  usedLegacyFunctions.forEach((legacyName) => {
    const { newFunctionName } = LEGACY_TO_NEW_FORMAT_MAP[legacyName as LegacyFunctionName];
    newFunctionNames.add(newFunctionName);
  });

  // Check which new functions are already imported
  const alreadyImportedFunctions = getAlreadyImportedFunctions(config);

  // Only add imports for functions that aren't already imported
  const functionsToImport = Array.from(newFunctionNames).filter(
    (newFunctionName) => !alreadyImportedFunctions.has(newFunctionName),
  );

  if (functionsToImport.length === 0) {
    return;
  }

  // Create import specifiers for new functions
  const newImportSpecifiers = functionsToImport.map((newFunctionName) =>
    j.importSpecifier(j.identifier(newFunctionName), j.identifier(newFunctionName)),
  );

  // Check if the new import already exists
  const existingNewImport = root
    .find(j.ImportDeclaration, {
      source: { value: 'eh-utils/time/format/formatters' },
    })
    .size();

  if (existingNewImport === 0) {
    // Add new import declaration
    root
      .find(j.ImportDeclaration)
      .at(-1)
      .insertAfter(
        j.importDeclaration(
          newImportSpecifiers,
          j.stringLiteral('eh-utils/time/format/formatters'),
        ),
      );

    logger.debug(`Added new format imports to: ${filePath}`);
  } else {
    // Add new specifiers to existing import
    root
      .find(j.ImportDeclaration, {
        source: { value: 'eh-utils/time/format/formatters' },
      })
      .forEach((path) => {
        if (!path?.value?.specifiers) return;

        const specifiers = path.value.specifiers as ImportSpecifier[];
        const existingImportedNames = getExistingImportedNames(specifiers);

        // Only add specifiers that aren't already in the import
        newImportSpecifiers.forEach((specifier) => {
          if (
            specifier.type === 'ImportSpecifier' &&
            specifier.imported &&
            !existingImportedNames.has(specifier.imported.name)
          ) {
            specifiers.push(specifier);
          }
        });

        logger.debug(`Added new specifiers to existing import in: ${filePath}`);
      });
  }
};

/**
 * Gets already imported functions from 'eh-utils/time/format/formatters'
 */
const getAlreadyImportedFunctions = (config: Config): Set<string> => {
  const { j, root } = config;
  const alreadyImportedFunctions = new Set<string>();

  root
    .find(j.ImportDeclaration, {
      source: { value: 'eh-utils/time/format/formatters' },
    })
    .forEach((path) => {
      if (!path?.value?.specifiers) return;

      const specifiers = path.value.specifiers as ImportSpecifier[];
      specifiers.forEach((specifier) => {
        if (specifier.type === 'ImportSpecifier' && specifier.imported) {
          alreadyImportedFunctions.add(specifier.imported.name);
        }
      });
    });

  return alreadyImportedFunctions;
};

/**
 * Gets names of imports from import specifiers
 */
const getExistingImportedNames = (specifiers: ImportSpecifier[]): Set<string> => {
  const existingImportedNames = new Set<string>();

  specifiers.forEach((specifier) => {
    if (specifier.type === 'ImportSpecifier' && specifier.imported) {
      existingImportedNames.add(specifier.imported.name);
    }
  });

  return existingImportedNames;
};

/**
 * Replaces legacy format function calls with new ones
 */
const replaceLegacyFormatFunctions = (config: Config) => {
  const { j, root, filePath } = config;
  let hasReplacement = false;

  Object.keys(LEGACY_TO_NEW_FORMAT_MAP).forEach((legacyName) => {
    root
      .find(j.CallExpression, {
        callee: {
          type: 'Identifier',
          name: legacyName,
        },
      })
      .forEach((path) => {
        if (!path?.value?.callee) return;

        const args = path.value.arguments;
        const { newFunctionName, newOptions } =
          LEGACY_TO_NEW_FORMAT_MAP[legacyName as LegacyFunctionName];

        // Check if there's a second argument (options object or variable)
        let legacyOptions;
        if (args.length > 1) {
          legacyOptions = extractSecondArgument(path, config);
          logger.debug(`Found legacy options for ${legacyName}:`, legacyOptions);
        }

        j(path).replaceWith(
          createNewFormatCall(newFunctionName, args, newOptions, config, legacyOptions),
        );

        hasReplacement = true;
      });
  });

  if (hasReplacement) {
    logger.debug(`Replaced legacy format functions with new ones in file: ${filePath}`);
  }

  return hasReplacement;
};

/**
 * Checks if file contains legacy imports
 */
const hasLegacyFormatImports = (config: Config): boolean => {
  const { j, root } = config;

  return (
    root
      .find(j.ImportDeclaration, {
        source: { value: 'eh-utils/time/format' },
      })
      .size() > 0
  );
};

/**
 * Main transformer function
 */
export default function transformer(file: FileInfo, api: API) {
  const j = api.jscodeshift;
  const root = j(file.source);
  const config: Config = { j, root, filePath: file.path };

  try {
    logger.debug(`Transforming file: ${file.path}`);

    // First check if the file has imports from 'eh-utils/time/format'
    if (!hasLegacyFormatImports(config)) {
      logger.debug(`Skipping file ${file.path} - no legacy format imports found`);
      return file.source;
    }

    // Replace function calls
    const hasReplacements = replaceLegacyFormatFunctions(config);

    // Handle imports if replacements were made
    if (hasReplacements) {
      handleImports(config);
    }

    return root.toSource({ quote: 'single', trailingComma: true });
  } catch (error) {
    logger.error(`Transformation failed for file: ${file.path}`, error);
    return file.source;
  }
}
