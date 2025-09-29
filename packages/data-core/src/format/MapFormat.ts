import type { MapData } from '../types'

/**
 * Error thrown when map data validation fails.
 *
 * @class MapValidationError
 * @extends Error
 * @since 0.1.0
 */
export class MapValidationError extends Error {
  /**
   * The field that failed validation
   */
  public readonly field?: string

  /**
   * The value that caused the validation failure
   */
  public readonly value?: unknown

  constructor(message: string, field?: string, value?: unknown) {
    super(message)
    this.name = 'MapValidationError'
    this.field = field
    this.value = value
  }
}

/**
 * Handles serialization, deserialization, and validation of map data.
 * Provides platform-independent map format processing.
 *
 * @class MapFormat
 * @since 0.1.0
 */
export class MapFormat {
  /**
   * Current version of the map format
   */
  static readonly CURRENT_VERSION = '1.0.0'

  /**
   * Validates map data structure and throws detailed errors for invalid data.
   *
   * @param data - The map data to validate
   * @throws {MapValidationError} When validation fails
   *
   * @example
   * ```typescript
   * try {
   *   MapFormat.validate(mapData);
   *   console.log('Map data is valid');
   * } catch (error) {
   *   if (error instanceof MapValidationError) {
   *     console.error(`Validation failed for ${error.field}:`, error.message);
   *   }
   * }
   * ```
   */
  static validate(data: MapData): void {
    if (!data) {
      throw new MapValidationError('Map data is required', 'data')
    }

    // Validate version
    if (!data.version) {
      throw new MapValidationError('Map version is required', 'version')
    }

    if (typeof data.version !== 'string') {
      throw new MapValidationError(
        'Map version must be a string',
        'version',
        data.version,
      )
    }

    // Validate tile dimensions
    if (
      !data.tileWidth ||
      typeof data.tileWidth !== 'number' ||
      data.tileWidth <= 0
    ) {
      throw new MapValidationError(
        'Tile width must be a positive number',
        'tileWidth',
        data.tileWidth,
      )
    }

    if (
      !data.tileHeight ||
      typeof data.tileHeight !== 'number' ||
      data.tileHeight <= 0
    ) {
      throw new MapValidationError(
        'Tile height must be a positive number',
        'tileHeight',
        data.tileHeight,
      )
    }

    // Validate map dimensions
    if (
      !data.columns ||
      typeof data.columns !== 'number' ||
      data.columns <= 0
    ) {
      throw new MapValidationError(
        'Map columns must be a positive number',
        'columns',
        data.columns,
      )
    }

    if (!data.rows || typeof data.rows !== 'number' || data.rows <= 0) {
      throw new MapValidationError(
        'Map rows must be a positive number',
        'rows',
        data.rows,
      )
    }

    // Validate layers
    if (!Array.isArray(data.layers)) {
      throw new MapValidationError(
        'Layers must be an array',
        'layers',
        data.layers,
      )
    }

    if (data.layers.length === 0) {
      throw new MapValidationError('Map must have at least one layer', 'layers')
    }

    // Validate sprite sets
    if (!data.spriteSets || !Array.isArray(data.spriteSets)) {
      throw new MapValidationError(
        'Sprite sets must be an array',
        'spriteSets',
        data.spriteSets,
      )
    }

    if (data.spriteSets.length === 0) {
      throw new MapValidationError(
        'Map must have at least one sprite set',
        'spriteSets',
      )
    }

    // Validate each sprite set reference
    data.spriteSets.forEach((spriteSet, index) => {
      if (!spriteSet.id || typeof spriteSet.id !== 'string') {
        throw new MapValidationError(
          `Sprite set at index ${index} must have a valid id`,
          `spriteSets[${index}].id`,
          spriteSet.id,
        )
      }

      if (!spriteSet.path || typeof spriteSet.path !== 'string') {
        throw new MapValidationError(
          `Sprite set "${spriteSet.id}" must have a valid path`,
          `spriteSets[${index}].path`,
          spriteSet.path,
        )
      }

      if (spriteSet.type !== 'spriteset') {
        throw new MapValidationError(
          `Sprite set "${spriteSet.id}" must have type "spriteset"`,
          `spriteSets[${index}].type`,
          spriteSet.type,
        )
      }
    })
  }

  /**
   * Serializes map data to a JSON string with proper formatting.
   *
   * @param data - The map data to serialize
   * @returns JSON string representation of the map data
   * @throws {MapValidationError} When data is invalid
   *
   * @example
   * ```typescript
   * const jsonString = MapFormat.serialize(mapData);
   * console.log('Map serialized to JSON');
   * ```
   */
  static serialize(data: MapData): string {
    this.validate(data)
    return JSON.stringify(data, null, 2)
  }

  /**
   * Deserializes a JSON string to map data with validation.
   *
   * @param json - The JSON string to deserialize
   * @returns Validated map data object
   * @throws {MapValidationError} When JSON is invalid or data doesn't pass validation
   * @throws {SyntaxError} When JSON parsing fails
   *
   * @example
   * ```typescript
   * try {
   *   const mapData = MapFormat.deserialize(jsonString);
   *   console.log('Map deserialized successfully');
   * } catch (error) {
   *   if (error instanceof MapValidationError) {
   *     console.error('Invalid map data:', error.message);
   *   } else {
   *     console.error('Failed to parse JSON:', error);
   *   }
   * }
   * ```
   */
  static deserialize(json: string): MapData {
    if (!json || typeof json !== 'string') {
      throw new MapValidationError(
        'JSON string is required for deserialization',
        'json',
        json,
      )
    }

    let data: unknown
    try {
      data = JSON.parse(json)
    } catch (error) {
      throw new MapValidationError(
        `Failed to parse JSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'json',
        json,
      )
    }

    // Type assertion after parsing
    const mapData = data as MapData
    this.validate(mapData)

    return mapData
  }

  /**
   * Checks if the provided data conforms to the MapData interface.
   * This is a type guard function for runtime type checking.
   *
   * @param data - The data to check
   * @returns True if the data is valid MapData
   *
   * @example
   * ```typescript
   * if (MapFormat.isValidMapData(data)) {
   *   // data is guaranteed to be MapData here
   *   console.log('Valid map data:', data.name);
   * }
   * ```
   */
  static isValidMapData(data: unknown): data is MapData {
    try {
      this.validate(data as MapData)
      return true
    } catch {
      return false
    }
  }
}
