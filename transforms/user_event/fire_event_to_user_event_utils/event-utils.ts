import type { AwaitExpression, BlockStatement, MemberExpression } from 'jscodeshift';
import { Config, FireEventMethod } from './types';
import { FIRE_EVENT_TO_USER_EVENT_MAP } from './constants';

import { isTargetValueObject, extractValueFromTarget } from './target-value-utils';
import { createAwaitExpression, createMemberExpression } from './ast-utils';

// Event Handling
export const replaceFireEventWithUserEvent = (
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
            config
              .j(fireEventPath)
              .replaceWith(createUserEventCall(userEventMethod, args as any[], config));
            console.error(`[ERROR] Failed to extract value from target: ${e.message}`);
          }
        } else {
          config
            .j(fireEventPath)
            .replaceWith(createUserEventCall(userEventMethod, args as any[], config));
        }
      } else if ((method === 'keyDown' || method === 'keyUp') && args.length === 2) {
        // Handle keyboard events
        const [element, keyEventArg] = args as [any, any];
        config
          .j(fireEventPath)
          .replaceWith(createUserEventKeyboardCall(element, keyEventArg, config));
        hasReplacement = true;
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

export const createUserEventCall = (
  method: string,
  args: any[],
  config: Config,
): AwaitExpression => {
  const userMember = createMemberExpression(config.j.identifier('user'), method, config);
  const callExpr = config.j.callExpression(userMember, args as any);
  return createAwaitExpression(callExpr, config);
};

// Special handling for creating user.type() call based on value type
export const createUserEventTypeCall = (
  element: any,
  value: any,
  config: Config,
): AwaitExpression => {
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

  // Handle identifier (like jobTitle) - pass directly
  if (value.type === 'Identifier') {
    return createUserEventCall('advancedType', [element, value], config);
  }

  // Default behavior for other values
  return createUserEventCall('advancedType', [element, value], config);
};

// Special handling for creating user.keyboard() call based on key event
export const createUserEventKeyboardCall = (
  element: any,
  keyEvent: any,
  config: Config,
): AwaitExpression => {
  // Extract key value from the second argument if it exists
  let keyValue = '';

  if (keyEvent && keyEvent.type === 'ObjectExpression') {
    const properties = keyEvent.properties || [];

    // Find the 'key' property in the object
    const keyProp = properties.find(
      (prop: any) => prop.key && prop.key.type === 'Identifier' && prop.key.name === 'key',
    );

    if (keyProp && keyProp.value) {
      // Handle different value types (Literal and StringLiteral)
      if (keyProp.value.type === 'StringLiteral' || keyProp.value.type === 'Literal') {
        keyValue = keyProp.value.value;
        console.log(`[DEBUG] Extracted key value: '${keyValue}'`);
      }
    } else {
      // If no 'key' property, try to find 'code' property
      const codeProp = properties.find(
        (prop: any) => prop.key && prop.key.type === 'Identifier' && prop.key.name === 'code',
      );

      if (codeProp && codeProp.value) {
        // Handle different value types (Literal and StringLiteral)
        if (codeProp.value.type === 'StringLiteral' || codeProp.value.type === 'Literal') {
          keyValue = codeProp.value.value;
          console.log(`[DEBUG] Extracted code value: '${keyValue}'`);
        }
      }
    }
  }

  // Format the key for userEvent.keyboard
  // Special keys should be wrapped in curly braces
  const specialKeys = [
    'Enter',
    'Tab',
    'Escape',
    'Backspace',
    'Delete',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
  ];
  const formattedKey = specialKeys.includes(keyValue) ? `{${keyValue}}` : keyValue;

  console.log(`[DEBUG] Converting keyboard event with key '${keyValue}' to '${formattedKey}'`);

  return createUserEventCall('keyboard', [config.j.stringLiteral(formattedKey)], config);
};

export const createUserTypeAnnotation = (config: Config) => {
  return config.j.tsTypeAnnotation(
    config.j.tsTypeReference(config.j.identifier('ExtendedUserEvent')),
  );
};
