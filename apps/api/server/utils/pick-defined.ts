export const pickDefined = <T extends object>(input: T): Partial<T> => {
  const output: Partial<T> = {};
  for (const key in input) {
    const value = input[key];
    if (value !== undefined) output[key] = value;
  }
  return output;
};
