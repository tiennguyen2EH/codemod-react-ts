import type {
  ASTPath,
  CallExpression,
  ArrowFunctionExpression,
  FunctionExpression,
  BlockStatement,
} from 'jscodeshift';
import { Config } from './types';
import { replaceFireEventWithUserEvent } from './event-utils';
import { hasViewDeclarationFromRenderMethods, getUserFromSetup } from './setup-utils';
import { identifyAndUpdateHelperFunctionCalls } from './helper-function-utils';
import { prefixUserEventWithView } from './view-utils';

// Test Callback Handling
export const addAsyncToCallback = (
  callback: FunctionExpression | ArrowFunctionExpression,
  config: Config,
) => {
  if (!callback.async) {
    callback.async = true;
    console.log(`[DEBUG] Made callback async in file: ${config.filePath}`);
  }
};

export const handleTestCallback = (callbackPath: ASTPath<CallExpression>, config: Config) => {
  if (!callbackPath?.value?.arguments?.[1]) return;

  const callback = callbackPath.value.arguments[1];
  if (callback.type !== 'FunctionExpression' && callback.type !== 'ArrowFunctionExpression') return;

  const body = callback.body.type === 'BlockStatement' ? callback.body.body : [];
  if (!Array.isArray(body)) return;

  const hasFireEventReplacement = replaceFireEventWithUserEvent(body, config);
  prefixUserEventWithView(body, config);

  // Identify helper function calls in test blocks and update them to pass the user parameter
  const modifiedHelperFunctionCalls = identifyAndUpdateHelperFunctionCalls(body, config);

  // Only proceed with additional changes if we replaced fireEvent or updated helper functions
  if (!hasFireEventReplacement && !modifiedHelperFunctionCalls) return;

  if (!hasViewDeclarationFromRenderMethods(body, config)) {
    getUserFromSetup(body, config);
  }

  addAsyncToCallback(callback, config);
};
