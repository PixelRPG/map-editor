import { Loadable, Scene, TileMap } from 'excalibur';
import { MapData, TileSetData } from '@pixelrpg/map-format-core';
import { ExcaliburMapFormat } from '../format/ExcaliburMapFormat';
import { TileSetResource } from './TileSetResource';
import { MapResourceOptions } from '../types/MapResourceOptions';

/**
 * Resource class for loading custom Map format into Excalibur
 */
export class MapResource implements Loadable<TileMap> {
    data!: TileMap;
    private readonly headless: boolean = false;
    private tileSetResources: Map<string, TileSetResource> = new Map();

    constructor(private mapData: MapData, options?: MapResourceOptions) {
        this.headless = options?.headless ?? this.headless;

        // Create TileSetResources for each tileset
        this.initializeTileSetResources();
    }

    private initializeTileSetResources(): void {
        this.mapData.tileSets.forEach((tileSet: TileSetData) => {
            this.tileSetResources.set(
                tileSet.id,
                new TileSetResource(tileSet, { headless: this.headless })
            );
        });
    }

    async load(): Promise<TileMap> {
        try {
            // First load all tilesets
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