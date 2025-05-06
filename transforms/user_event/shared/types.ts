import { Collection, Node, JSCodeshift } from 'jscodeshift';

// Types
export type Config = {
  j: JSCodeshift;
  root: Collection<Node>;
  filePath: string;
};
