import { ImageSource, Loadable, Scene, TileMap } from 'excalibur';
import { MapData, TileSetData, TileSetReference } from '@pixelrpg/map-format-core';
import { ExcaliburMapFormat } from '../format/ExcaliburMapFormat';
import { TileSetResource } from './TileSetResource';
import { MapResourceOptions } from '../types/MapResourceOptions';

/**
 * Resource class for loading custom Map format into Excalibur
 */
export class MapResource implements Loadable<TileMap> {
    data!: TileMap;
    private readonly headless: boolean = false;
    private readonly basePath: string = '';
    private tileSetResources: Map<string, TileSetResource> = new Map();
    private tileSetData: Map<string, TileSetData> = new Map();

    constructor(private mapData: MapData, options?: MapResourceOptions) {
        this.headless = options?.headless ?? this.headless;
        this.basePath = options?.basePath ?? this.basePath;

        // Create TileSetResources for each tileset
        this.initializeTileSetResources();
    }

    private initializeTileSetResources(): void {
        this.mapData.tileSets.forEach((tileSet: TileSetData | TileSetReference) => {
            if (this.isTileSetReference(tileSet)) {
                // Handle external tileset reference - we'll load it during the load() method
                // Just store the reference for now
            } else {
                // Handle inline tileset data
                this.tileSetData.set(tileSet.id, tileSet);
                this.tileSetResources.set(
                    tileSet.id,
                    new TileSetResource(tileSet, { headless: this.headless })
                );
            }
        });
    }

    private isTileSetReference(tileSet: TileSetData | TileSetReference): tileSet is TileSetReference {
        return 'path' in tileSet && tileSet.type === 'tileset';
    }

    private async loadExternalTileSets(): Promise<void> {
        const externalTileSetLoads = this.mapData.tileSets
            .filter(this.isTileSetReference)
            .map(async (tileSetRef: TileSetReference) => {
                try {
                    // Construct the full path
                    const fullPath = `${this.basePath}${tileSetRef.path}`;

                    // Fetch the tileset data
                    const response = await fetch(fullPath);
                    if (!response.ok) {
                        throw new Error(`Failed to load tileset from ${fullPath}: ${response.statusText}`);
                    }

                    const tileSetData = await response.json() as TileSetData;

                    // Store the loaded data
                    this.tileSetData.set(tileSetRef.id, tileSetData);

                    // Create a resource for it
                    const resource = new TileSetResource(tileSetData, { headless: this.headless });
                    this.tileSetResources.set(tileSetRef.id, resource);

                    // Load the resource
                    return resource.load();
                } catch (e) {
                    console.error(`Error loading external tileset ${tileSetRef.path}:`, e);
                    throw e;
                }
            });

        await Promise.all(externalTileSetLoads);
    }

    async load(): Promise<TileMap> {
        try {
            // First load any external tilesets
            await this.loadExternalTileSets();

            // Then load all tileset resources
            await Promise.all(
                Array.from(this.tileSetResources.values()).map(resource => resource.load())
            );

            // Convert the map data to Excalibur format
            this.data = ExcaliburMapFormat.toExcalibur(this.mapData);

            return this.data;
        } catch (e) {
            console.error(`Could not load map: ${e}`);
            throw e;
        }
    }

    isLoaded(): boolean {
        return !!this.data;
    }

    /**
     * Adds the loaded map to an Excalibur scene
     */
    addToScene(scene: Scene): void {
        if (!this.isLoaded()) {
            console.warn('Map is not loaded! Nothing will be added to the scene.');
            return;
        }

        // Add the tilemap to the scene
        scene.add(this.data);
    }
} 