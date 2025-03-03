/**
 * Configuration for game project startup
 */
export interface GameStartupConfig {
    /**
     * ID of the initial map to load at game start
     */
    initialMapId: string;

    /**
     * Initial player position (x coordinate)
     */
    initialX?: number;

    /**
     * Initial player position (y coordinate)
     */
    initialY?: number;

    /**
     * Initial player direction
     */
    initialDirection?: 'up' | 'down' | 'left' | 'right';
} 