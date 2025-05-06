// Target Value Utilities
export const isTargetValueObject = (obj: any): boolean => {
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

export const extractValueFromTarget = (obj: any): any => {
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

  // Accept StringLiteral, NumericLiteral, or Identifier
  if (
    value.type !== 'StringLiteral' &&
    value.type !== 'NumericLiteral' &&
    value.type !== 'Literal' &&
    value.type !== 'Identifier'
  ) {
    throw new Error('Value must be a string literal, number literal, or identifier');
  }

  return value;
};
