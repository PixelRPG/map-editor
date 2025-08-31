/**
 * Convert a method name (which could be a string, number, or symbol) to a string
 */
export function methodToString(method: string | number | symbol): string {
  return String(method)
}

/**
 * Convert a method name back from a string to its original type
 * Note: This is a type-safe way to convert strings back to method names
 */
export function stringToMethod<T extends object>(
  str: string,
  registry: T,
): keyof T {
  if (str in registry) {
    return str as keyof T
  }
  throw new Error(`Invalid method name: ${str}`)
}
