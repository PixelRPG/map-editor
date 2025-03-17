/**
 * Project configuration for loading games
 */
export interface GameProject {
    /**
     * Unique identifier of the game
     */
    id: string;

    /**
     * Display name of the game
     */
    name: string;

    /**
     * Path to the game project configuration file (JSON)
     */
    configPath: string;
}

/**
 * RPC request to load a game project
 */
export interface LoadProjectRequest {
    /**
     * Path to the configuration file
     */
    projectPath: string;
}

/**
 * RPC response after loading a game project
 */
export interface LoadProjectResponse {
    /**
     * Success status
     */
    success: boolean;

    /**
     * Error message if loading failed
     */
    error?: string;
} 