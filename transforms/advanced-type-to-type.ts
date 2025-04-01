/**
 * Migrate user.advancedType() to user.type()
 *
 * This codemod transforms user.advancedType() calls to user.type() calls in test files.
 * This is the final migration step after moving from fireEvent to userEvent.
 *
 * Features:
 * - Finds all user.advancedType() calls in test files
 * - Transforms them to user.type() calls
 * - Preserves all arguments
 * - Provides debug logging for transformation steps
 * - Handles error conditions gracefully
 */

import type { API, FileInfo, Identifier, MemberExpression } from 'jscodeshift';

// Main Transformer
export default function transformer(file: FileInfo, api: API) {
  const j = api.jscodeshift;
  const root = j(file.source);

  try {
    console.log(`[DEBUG] Transforming file: ${file.path}`);

    // Find all user.advancedType calls
    const advancedTypeCalls = root.find(j.CallExpression, {
      callee: {
        type: 'MemberExpression',
        object: { type: 'Identifier', name: 'user' },
        property: { type: 'Identifier', name: 'advancedType' },
      },
    });

    console.log(
      `[DEBUG] Found ${advancedTypeCalls.length} user.advancedType calls to migrate in ${file.path}`,
    );

    // Process each advancedType call
    advancedTypeCalls.forEach((path) => {
      // Ensure callee is a MemberExpression and property is an Identifier
      if (path.value.callee.type !== 'MemberExpression') return;
      const callee = path.value.callee as MemberExpression;

      if (callee.property.type !== 'Identifier') return;
      const propertyNode = callee.property as Identifier;

      // Change advancedType to type
      propertyNode.name = 'type';

      console.log(
        `[DEBUG] Transformed user.advancedType to user.type at line ${path.value.loc?.start.line || 'unknown'}`,
      );
    });

    return root.toSource({ quote: 'single' });
  } catch (error) {
    console.error(`[ERROR] Transformation failed for file: ${file.path}`, error.message);
    return file.source;
  }
}
