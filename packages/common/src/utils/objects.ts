/**
 * Performs a deep comparison between two values to determine if they are equivalent.
 * Supports comparing arrays, objects, dates, and primitive values.
 * 
 * @param value The value to compare
 * @param other The other value to compare
 * @returns Returns true if the values are equivalent, else false
 */
export function isEqual(value: any, other: any): boolean {
    // Handle simple cases first
    if (value === other) {
        return true;
    }

    // Handle null/undefined
    if (value == null || other == null) {
        return value === other;
    }

    // Handle dates
    if (value instanceof Date && other instanceof Date) {
        return value.getTime() === other.getTime();
    }

    // Handle arrays
    if (Array.isArray(value) && Array.isArray(other)) {
        if (value.length !== other.length) {
            return false;
        }
        return value.every((val, index) => isEqual(val, other[index]));
    }

    // Handle objects
    if (typeof value === 'object' && typeof other === 'object') {
        const valueKeys = Object.keys(value);
        const otherKeys = Object.keys(other);

        if (valueKeys.length !== otherKeys.length) {
            return false;
        }

        return valueKeys.every(key => {
            if (!Object.prototype.hasOwnProperty.call(other, key)) {
                return false;
            }
            return isEqual(value[key], other[key]);
        });
    }

    // Handle other cases (strings, numbers, booleans)
    return value === other;
}