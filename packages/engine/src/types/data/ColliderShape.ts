/**
 * Collider shape definitions with improved type safety
 */
export type ColliderShape =
    | { type: 'rectangle', width: number, height: number, offset?: { x: number, y: number } }
    | { type: 'circle', radius: number, offset?: { x: number, y: number } }
    | { type: 'polygon', points: { x: number, y: number }[] };