import type { ImportSpecifier } from 'jscodeshift';
import { Config } from './types';

// Import Management
export const removeFireEventImport = (config: Config) => {
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

// Function to add import for userEvent and ExtendedUserEvent
export const addUserEventImport = (shouldImportExtendedUserEvent: boolean, config: Config) => {
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
