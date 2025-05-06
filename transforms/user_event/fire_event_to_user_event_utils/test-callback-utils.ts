import type {
  ASTPath,
  CallExpression,
  ArrowFunctionExpression,
  FunctionExpression,
  BlockStatement,
} from 'jscodeshift';
import { Config } from './types';
import { replaceFireEventWithUserEvent } from './event-utils';
import { getUserFromSetup } from './setup-utils';
import { identifyAndUpdateHelperFunctionCalls } from './helper-function-utils';
import { hasViewDeclarationFromRenderMethods, prefixUserEventWithView } from '../shared';

// Test Callback Handling
export const addAsyncToCallbackPath = (callbackPath: ASTPath<CallExpression>, config: Config) => {
  const callback = callbackPath.value.arguments[1];
  if (!callback) return;
  if (callback.type !== 'FunctionExpression' && callback.type !== 'ArrowFunctionExpression') return;

  if (!callback.async) {
    callback.async = true;
    console.log(`[DEBUG] Made callback async in file: ${config.filePath}`);
  }
};

const getBodyFromCallbackPath = (callbackPath: ASTPath<CallExpression>) => {
  const callback = callbackPath.value.arguments[1];
  if (callback.type !== 'FunctionExpression' && callback.type !== 'ArrowFunctionExpression') return;

  const body = callback.body.type === 'BlockStatement' ? callback.body.body : [];
  if (!Array.isArray(body)) return null;
  return body;
};

export const handleTestCallback = (callbackPath: ASTPath<CallExpression>, config: Config) => {
  const body = getBodyFromCallbackPath(callbackPath);
  if (!body) return;

  const hasFireEventReplacement = replaceFireEventWithUserEvent(body, config);
  prefixUserEventWithView(body, config);

  // Identify helper function calls in test blocks and update them to pass the user parameter
  const modifiedHelperFunctionCalls = identifyAndUpdateHelperFunctionCalls(body, config);

  // Only proceed with additional changes if we replaced fireEvent or updated helper functions
  if (!hasFireEventReplacement && !modifiedHelperFunctionCalls) return;

  if (!hasViewDeclarationFromRenderMethods(body, config)) {
    getUserFromSetup(body, config);
  }

  addAsyncToCallbackPath(callbackPath, config);
};
