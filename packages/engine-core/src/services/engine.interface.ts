import { EventDispatcher } from '@pixelrpg/message-channel-core';
import { EngineEvent, EngineStatus, InputEvent, ProjectLoadOptions } from '../types/index';

/**
 * Interface for the game engine
 */
export interface EngineInterface {
    /**
     * Current status of the engine
     */
    status: EngineStatus;

    /**
     * Event dispatcher for engine events
     */
    // events: EventDispatcher<EngineEvent>;

    /**
     * Initialize the engine
     */
    initialize(): Promise<void>;

    /**
     * Load a game project
     * @param projectPath Path to the game project file
     * @param options Options for loading the project
     */
    loadProject(projectPath: string, options?: ProjectLoadOptions): Promise<void>;

    /**
     * Load a specific map
     * @param mapId ID of the map to load
     */
    loadMap(mapId: string): Promise<void>;

    /**
     * Start the engine
     */
    start(): Promise<void>;

    /**
     * Stop the engine
     */
    stop(): Promise<void>;
} 