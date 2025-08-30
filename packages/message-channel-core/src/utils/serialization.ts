/**
 * Standardized serialization utilities for RPC messages
 * Ensures consistent behavior across all platforms (GJS, WebView, Web)
 */

/**
 * Safely serialize a message to JSON string
 * Handles circular references and undefined values consistently
 */
export function serializeMessage(message: unknown): string {
  try {
    // Use replacer to handle undefined values consistently
    return JSON.stringify(message, (_key, value) => {
      // Convert undefined to null for JSON compatibility
      // This ensures consistent behavior across platforms
      if (value === undefined) {
        return null
      }
      return value
    })
  } catch (error) {
    console.error('Failed to serialize message:', error)
    throw new Error(`Message serialization failed: ${error}`)
  }
}

/**
 * Safely deserialize a JSON string to message object
 * Includes validation and error handling
 */
export function deserializeMessage(jsonString: string): unknown {
  try {
    const parsed = JSON.parse(jsonString)

    // Basic validation
    if (parsed === null || typeof parsed !== 'object') {
      throw new Error('Invalid message format: must be an object')
    }

    return parsed
  } catch (error) {
    console.error('Failed to deserialize message:', error)
    throw new Error(`Message deserialization failed: ${error}`)
  }
}

/**
 * Create a standardized error message for transmission
 * Ensures consistent error format across platforms
 */
export function createTransmissionError(
  originalError: unknown,
  context: string,
): { message: string; code: number; data?: unknown } {
  const errorMessage =
    originalError instanceof Error
      ? originalError.message
      : String(originalError)

  return {
    message: `Transmission failed in ${context}: ${errorMessage}`,
    code: 500, // Internal error
    data: {
      context,
      originalError: errorMessage,
      timestamp: Date.now(),
    },
  }
}

/**
 * Validate message structure before transmission
 * Ensures messages meet minimum requirements
 */
export function validateMessageForTransmission(message: unknown): boolean {
  if (!message || typeof message !== 'object') {
    return false
  }

  const msg = message as Record<string, unknown>

  // Must have an ID for RPC messages
  if (!msg.id || typeof msg.id !== 'string') {
    return false
  }

  // Must have a type
  if (!msg.type || typeof msg.type !== 'string') {
    return false
  }

  return true
}
