/**
 * Validates that a value is a non-null object
 */
export const isNonNullObject = (value: unknown): value is Record<string, unknown> => {
    return value !== null && typeof value === 'object';
};

/**
 * Validates that an object has a property of a specific type
 */
export const hasPropertyOfType = <T extends Record<string, unknown>, K extends string, V>(
    obj: T,
    property: K,
    typeCheck: (value: unknown) => value is V
): obj is T & { [P in K]: V } => {
    return property in obj && typeCheck((obj as any)[property]);
};

/**
 * Validates that an object has a string property
 */
export const hasStringProperty = <T extends Record<string, unknown>, K extends string>(
    obj: T,
    property: K
): obj is T & { [P in K]: string } => {
    return hasPropertyOfType(obj, property, (value): value is string => typeof value === 'string');
};

/**
 * Validates that an object has a non-empty string property
 */
export const hasNonEmptyStringProperty = <T extends Record<string, unknown>, K extends string>(
    obj: T,
    property: K
): obj is T & { [P in K]: string } => {
    return hasStringProperty(obj, property) && (obj[property] as string).trim() !== '';
}; 