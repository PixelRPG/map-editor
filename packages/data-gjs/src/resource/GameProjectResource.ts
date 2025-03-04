import Gio from '@girs/gio-2.0';
import GLib from '@girs/glib-2.0';
import { GameProjectData, MapData, SpriteSetData } from '@pixelrpg/data-core';
import { GameProjectResourceOptions } from '../types/GameProjectResourceOptions';
import { MapResource } from './MapResource';
import { SpriteSetResource } from './SpriteSetResource';
import { loadTextFile } from '../utils';
import { GameProjectFormat } from '@pixelrpg/data-core';

/**
 * GJS implementation of a game project resource loader
 */
export class GameProjectResource {
    private _data: GameProjectData | null = null;
    private _path: string;
    private _baseDir: Gio.File;
    private _preloadResources: boolean;
    private _useGResource: boolean;
    private _resourcePrefix: string;

    private _maps: Map<string, MapResource> = new Map();
    private _spriteSets: Map<string, SpriteSetResource> = new Map();

    /**
     * Create a new GameProjectResource
     * @param options Options for loading the game project
     */
    constructor(path: string, options: GameProjectResourceOptions) {
        this._path = path;

        if (options.baseDir) {
            if (typeof options.baseDir === 'string') {
                this._baseDir = Gio.File.new_for_path(options.baseDir);
            } else {
                this._baseDir = options.baseDir;
            }
        } else {
            // Default to the directory containing the project file
            const projectFile = Gio.File.new_for_path(this._path);
            const parent = projectFile.get_parent();
            this._baseDir = parent || Gio.File.new_for_path(GLib.get_current_dir());
        }

        this._preloadResources = options.preloadResources || false;
        this._useGResource = options.useGResource || false;
        this._resourcePrefix = options.resourcePrefix || '/org/pixelrpg/game';
    }

    /**
     * Load the game project data from the file
     * @returns Promise that resolves when the game project is loaded
     */
    async load(): Promise<GameProjectData> {
        if (this._data) {
            return this._data;
        }

        try {
            const projectText = await loadTextFile(
                this._path,
                this._useGResource,
                this._resourcePrefix
            );
            this._data = GameProjectFormat.deserialize(projectText);

            // Preload resources if requested
            if (this._preloadResources) {
                await this.preloadResources();
            }

            return this._data;
        } catch (error) {
            console.error(`Error parsing game project file: ${error}`);
            throw error;
        }
    }

    /**
     * Preload all maps and sprite sets referenced in the project
     */
    async preloadResources(): Promise<void> {
        if (!this._data) {
            throw new Error('Cannot preload resources before loading project data');
        }

        const loadPromises: Promise<any>[] = [];

        // Load maps
        if (this._data.maps) {
            for (const mapRef of this._data.maps) {
                const mapPath = this.resolvePath(mapRef.path);
                const mapResource = new MapResource(mapPath);
                this._maps.set(mapRef.id, mapResource);
                loadPromises.push(mapResource.load());
            }
        }

        // Load sprite sets
        if (this._data.spriteSets) {
            for (const spriteSetRef of this._data.spriteSets) {
                const spriteSetPath = this.resolvePath(spriteSetRef.path);
                const spriteSetResource = new SpriteSetResource(spriteSetPath);
                this._spriteSets.set(spriteSetRef.id, spriteSetResource);
                loadPromises.push(spriteSetResource.load());
            }
        }

        await Promise.all(loadPromises);
    }

    /**
     * Resolve a path relative to the base directory
     * @param path Path to resolve
     * @returns Absolute path
     */
    resolvePath(path: string): string {
        if (path.startsWith('/')) {
            return path;
        }

        if (this._useGResource) {
            return `${this._resourcePrefix}/${path}`;
        }

        return this._baseDir.get_child(path).get_path() || path;
    }

    /**
     * Get a map resource by ID
     * @param id Map ID
     * @returns Map resource or null if not found
     */
    async getMap(id: string): Promise<MapData | null> {
        if (!this._data) {
            await this.load();
        }

        // If already loaded, return it
        if (this._maps.has(id)) {
            const resource = this._maps.get(id)!;
            if (!resource.data) {
                await resource.load();
            }
            return resource.data;
        }

        // Find the map reference
        const mapRef = this._data?.maps?.find(m => m.id === id);
        if (!mapRef) {
            return null;
        }

        // Load the map
        const mapPath = this.resolvePath(mapRef.path);
        const mapResource = new MapResource(mapPath);
        this._maps.set(id, mapResource);

        return await mapResource.load();
    }

    /**
     * Get a sprite set resource by ID
     * @param id Sprite set ID
     * @returns Sprite set resource or null if not found
     */
    async getSpriteSet(id: string): Promise<SpriteSetData | null> {
        if (!this._data) {
            await this.load();
        }

        // If already loaded, return it
        if (this._spriteSets.has(id)) {
            const resource = this._spriteSets.get(id)!;
            if (!resource.data) {
                await resource.load();
            }
            return resource.data;
        }

        // Find the sprite set reference
        const spriteSetRef = this._data?.spriteSets?.find(s => s.id === id);
        if (!spriteSetRef) {
            return null;
        }

        // Load the sprite set
        const spriteSetPath = this.resolvePath(spriteSetRef.path);
        const spriteSetResource = new SpriteSetResource(spriteSetPath);
        this._spriteSets.set(id, spriteSetResource);

        return await spriteSetResource.load();
    }

    /**
     * Get the loaded game project data
     */
    get data(): GameProjectData | null {
        return this._data;
    }

    /**
     * Get the path to the game project file
     */
    get path(): string {
        return this._path;
    }
} 