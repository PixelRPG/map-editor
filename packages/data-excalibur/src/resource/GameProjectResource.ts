import { Loadable, Logger, Scene } from 'excalibur';
import {
    GameProjectData,
    GameProjectFormat,
    ResourceProvider,
    GameProjectResourceOptions
} from '@pixelrpg/data-core';
import { MapResource } from './MapResource';
import { SpriteSetResource } from './SpriteSetResource';
import { extractDirectoryPath, getFilename, joinPaths } from '@pixelrpg/data-core';

/**
 * Resource class for loading a complete game project into Excalibur
 */
export class GameProjectResource implements Loadable<GameProjectData>, ResourceProvider<GameProjectData> {
    /**
     * The loaded game project data
     */
    data!: GameProjectData;

    /**
     * Configuration options
     */
    private readonly headless: boolean = false;
    private readonly basePath: string = '';
    private readonly filename: string = '';
    private readonly preloadAllMaps: boolean = false;
    private readonly preloadAllSpriteSets: boolean = true;
    private readonly customInitialMapId?: string;

    /**
     * Store of all maps and sprite sets
     */
    private mapResources: Map<string, MapResource> = new Map();
    private spriteSetResources: Map<string, SpriteSetResource> = new Map();
    private _gameProjectData!: GameProjectData;

    /**
     * Flag to indicate if the resource is loaded
     */
    private _isLoaded: boolean = false;

    /**
     * Active map ID - the currently loaded map
     */
    private _activeMapId: string = '';

    /**
     * Logger for debugging
     */
    private logger = Logger.getInstance();

    /**
     * Static factory method to create a GameProjectResource from a file
     * @param path Path to the game project file
     * @param options Options for the game project resource
     * @returns Promise resolving to a GameProjectResource
     */
    static async fromFile(path: string, options?: GameProjectResourceOptions): Promise<GameProjectResource> {
        const resource = new GameProjectResource(path, options);
        await resource.load();
        return resource;
    }

    /**
     * Static factory method to create a GameProjectResource from data
     * @param data The game project data
     * @param options Options for the game project resource
     * @returns Promise resolving to a GameProjectResource
     */
    static async fromData(data: GameProjectData, options?: GameProjectResourceOptions): Promise<GameProjectResource> {
        // Create a resource with a dummy path
        const dummyPath = 'memory://game-project.json';
        const resource = new GameProjectResource(dummyPath, {
            ...options,
            headless: true // Use headless mode for memory-based resources
        });

        // Set the game project data directly
        resource._gameProjectData = data;
        resource._isLoaded = true;

        return resource;
    }

    /**
     * Get the currently active map
     */
    public get activeMap(): MapResource | undefined {
        return this.mapResources.get(this._activeMapId);
    }

    /**
     * Get all loaded maps
     */
    public get maps(): Map<string, MapResource> {
        return this.mapResources;
    }

    /**
     * Get all loaded sprite sets
     */
    public get spriteSets(): Map<string, SpriteSetResource> {
        return this.spriteSetResources;
    }

    /**
     * Get a map by ID
     */
    public getMap(id: string): MapResource | undefined {
        return this.mapResources.get(id);
    }

    /**
     * Get a sprite set by ID
     */
    public getSpriteSet(id: string): SpriteSetResource | undefined {
        return this.spriteSetResources.get(id);
    }

    constructor(path: string, options?: GameProjectResourceOptions) {
        this.headless = options?.headless ?? this.headless;
        this.preloadAllMaps = options?.preloadAllMaps ?? this.preloadAllMaps;
        this.preloadAllSpriteSets = options?.preloadAllSpriteSets ?? this.preloadAllSpriteSets;
        this.customInitialMapId = options?.initialMapId;
        this.basePath = extractDirectoryPath(path);
        this.filename = getFilename(path);
    }

    /**
     * Loads the game project data from JSON
     */
    private async loadGameProjectData(path: string): Promise<GameProjectData> {
        try {
            const response = await fetch(path);
            if (!response.ok) {
                throw new Error(`Failed to load game project data from ${path}: ${response.statusText}`);
            }

            const json = await response.text();
            const data = GameProjectFormat.deserialize(json);

            this.logger.debug(`Loaded game project: ${data.name} (ID: ${data.id})`);
            return data;
        } catch (error) {
            this.logger.error(`Error loading game project data: ${error}`);
            throw error;
        }
    }

    /**
     * Loads all sprite sets in the game project
     */
    private async loadSpriteSets(): Promise<void> {
        if (!this._gameProjectData.spriteSets || this._gameProjectData.spriteSets.length === 0) {
            this.logger.warn('No sprite sets found in game project');
            return;
        }

        // Process each sprite set
        for (const spriteSet of this._gameProjectData.spriteSets) {
            try {
                // Handle external sprite set reference
                const fullPath = joinPaths(this.basePath, spriteSet.path);
                const resource = new SpriteSetResource(fullPath, {
                    headless: this.headless
                });

                await resource.load();
                this.spriteSetResources.set(spriteSet.id, resource);
                this.logger.debug(`Loaded sprite set: ${spriteSet.id} from ${fullPath}`);
            } catch (error) {
                this.logger.error(`Failed to load sprite set ${spriteSet.id}: ${error}`);
                throw error;
            }
        }

        this.logger.info(`Loaded ${this.spriteSetResources.size} sprite sets`);
    }

    /**
     * Loads a single map by ID
     */
    private async loadMap(mapId: string): Promise<MapResource> {
        const mapEntry = this._gameProjectData.maps.find(map => map.id === mapId);
        if (!mapEntry) {
            throw new Error(`Map with ID ${mapId} not found in game project`);
        }

        try {
            // Handle external map reference
            const fullPath = joinPaths(this.basePath, mapEntry.path);
            const resource = new MapResource(fullPath, {
                headless: this.headless
            });

            await resource.load();
            this.mapResources.set(mapId, resource);
            this.logger.debug(`Loaded map: ${mapId} from ${fullPath}`);
            return resource;
        } catch (error) {
            this.logger.error(`Failed to load map ${mapId}: ${error}`);
            throw error;
        }
    }

    /**
     * Changes the active map to the specified map ID
     * If the map is not already loaded, it will be loaded first
     */
    public async changeMap(mapId: string): Promise<MapResource> {
        if (this._activeMapId === mapId && this.mapResources.has(mapId)) {
            return this.mapResources.get(mapId)!;
        }

        // Load the map if it's not already loaded
        if (!this.mapResources.has(mapId)) {
            await this.loadMap(mapId);
        }

        this._activeMapId = mapId;
        return this.mapResources.get(mapId)!;
    }

    /**
     * Load the game project data
     */
    async load(): Promise<GameProjectData> {
        try {
            if (this._isLoaded) {
                return this._gameProjectData;
            }

            // Load game project data from file if not already loaded
            if (!this._gameProjectData) {
                this._gameProjectData = await this.loadGameProjectData(joinPaths(this.basePath, this.filename));
            }

            // Load sprite sets if configured to do so
            if (this.preloadAllSpriteSets) {
                await this.loadSpriteSets();
            }

            // Load initial map
            const initialMapId = this.customInitialMapId || this._gameProjectData.startup?.initialMapId;
            if (initialMapId) {
                try {
                    const initialMap = await this.loadMap(initialMapId);
                    this._activeMapId = initialMapId;
                } catch (error) {
                    this.logger.error(`Failed to load initial map: ${initialMapId}`, error);
                }
            }

            // Load all maps if configured to do so
            if (this.preloadAllMaps) {
                for (const mapRef of this._gameProjectData.maps || []) {
                    try {
                        await this.loadMap(mapRef.id);
                    } catch (error) {
                        this.logger.error(`Failed to preload map: ${mapRef.id}`, error);
                    }
                }
            }

            // Set the data property for Excalibur compatibility
            this.data = this._gameProjectData;
            this._isLoaded = true;

            return this._gameProjectData;
        } catch (error) {
            this.logger.error('Error loading game project:', error);
            throw error;
        }
    }

    /**
     * Whether the resource is loaded
     */
    isLoaded(): boolean {
        return this._isLoaded;
    }

    /**
     * Get the resource data
     */
    getData(): GameProjectData {
        return this._gameProjectData;
    }

    /**
     * Save the game project data to a file
     * @param path Optional path to save to (defaults to the original path)
     */
    async saveToFile(path?: string): Promise<boolean> {
        // Implementation would depend on the platform
        console.warn('saveToFile not implemented for Excalibur GameProjectResource');
        return false;
    }

    /**
     * Adds the current active map to the scene
     * Other maps need to be added explicitly
     */
    addToScene(scene: Scene): void {
        if (!this.isLoaded()) {
            this.logger.warn('Attempted to add game project to scene before loading');
            return;
        }

        if (this.activeMap) {
            this.activeMap.addToScene(scene);
            this.logger.debug(`Added active map ${this._activeMapId} to scene`);
        }
    }

    /**
     * Adds a specific map to the scene
     */
    addMapToScene(mapId: string, scene: Scene): void {
        if (!this.mapResources.has(mapId)) {
            this.logger.warn(`Attempted to add map ${mapId} to scene, but it's not loaded`);
            return;
        }

        this.mapResources.get(mapId)!.addToScene(scene);
        this.logger.debug(`Added map ${mapId} to scene`);
    }

    /**
     * Debug information about the loaded game project
     */
    debugInfo(): void {
        this.logger.debug('====== Game Project Debug Info ======');
        this.logger.debug(`Project: ${this._gameProjectData.name} (ID: ${this._gameProjectData.id})`);
        this.logger.debug(`Version: ${this._gameProjectData.version}`);
        this.logger.debug(`Maps: ${this.mapResources.size}/${this._gameProjectData.maps.length} loaded`);
        this.logger.debug(`Sprite Sets: ${this.spriteSetResources.size}/${this._gameProjectData.spriteSets.length} loaded`);
        this.logger.debug(`Active Map: ${this._activeMapId}`);
        this.logger.debug('======================================');
    }
} 