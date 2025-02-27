import { Loadable, Scene, TileMap, Vector, Tile, Logger, Engine } from 'excalibur';
import { MapData, TileSetData, TileSetReference, LayerData, TileDataMap, MapFormat } from '@pixelrpg/map-format-core';
import { TileSetResource } from './TileSetResource';
import { MapResourceOptions } from '../types/MapResourceOptions';
import { extractDirectoryPath, getFilename, joinPaths } from '../utils';

/**
 * Resource class for loading custom Map format into Excalibur
 */
export class MapResource implements Loadable<TileMap> {
    data!: TileMap;
    private readonly headless: boolean = false;
    private readonly basePath: string = '';
    private readonly filename: string = '';
    private tileSetResources: Map<string, TileSetResource> = new Map();
    private mapData!: MapData;

    // Store tile data for easy access
    private tileMap!: TileMap;
    private tileToSpriteMap: Map<Tile, { tileSetId: string, tileId: number }> = new Map();

    // Logger for debugging
    private logger = Logger.getInstance();

    constructor(path: string, options?: MapResourceOptions) {
        this.headless = options?.headless ?? this.headless;
        this.basePath = extractDirectoryPath(path);
        this.filename = getFilename(path);
        this.logger.debug(`MapResource created with path: ${path}, basePath: ${this.basePath}, filename: ${this.filename}`);
    }

    /**
     * Checks if a tileset entry is a reference to an external file
     */
    private isTileSetReference(tileSet: TileSetData | TileSetReference): tileSet is TileSetReference {
        return 'path' in tileSet && tileSet.type === 'tileset';
    }

    private async loadExternalTileSets(): Promise<void> {
        this.logger.debug(`Loading external tilesets...`);

        const tileSetRefs = this.mapData.tileSets.filter(this.isTileSetReference);
        this.logger.debug(`Found ${tileSetRefs.length} external tileset references`);

        if (tileSetRefs.length === 0) {
            this.logger.warn('No external tilesets found in map data');
            return;
        }

        const externalTileSetLoads = tileSetRefs.map(async (tileSetRef: TileSetReference) => {
            try {
                // Join the base path with the tileset path
                const tileSetFullPath = joinPaths(this.basePath, tileSetRef.path);
                this.logger.debug(`Loading external tileset: ${tileSetRef.id} from ${tileSetFullPath}`);

                // Create a resource for the tileset
                const resource = new TileSetResource(tileSetFullPath, {
                    headless: this.headless
                });

                this.tileSetResources.set(tileSetRef.id, resource);

                // Load the resource
                await resource.load();

                // Log the loaded tileset info
                this.logger.debug(`Loaded tileset ${tileSetRef.id} with ${Object.keys(resource.sprites).length} sprites and ${Object.keys(resource.animations).length} animations`);

                // Log the first few sprite IDs for debugging
                const spriteIds = Object.keys(resource.sprites).slice(0, 5);
                if (spriteIds.length > 0) {
                    this.logger.debug(`First few sprite IDs: ${spriteIds.join(', ')}`);
                } else {
                    this.logger.warn(`No sprites found in tileset ${tileSetRef.id}`);
                }

                return resource;
            } catch (e) {
                this.logger.error(`Error loading external tileset ${tileSetRef.path}:`, e);
                throw e;
            }
        });

        await Promise.all(externalTileSetLoads);
        this.logger.debug(`Loaded ${this.tileSetResources.size} external tilesets`);
    }

    /**
     * Converts map data to Excalibur TileMap
     */
    private createTileMap(data: MapData): TileMap {
        MapFormat.validate(data);
        this.logger.debug(`Creating TileMap with dimensions: ${data.columns}x${data.rows}, tile size: ${data.tileWidth}x${data.tileHeight}`);

        const tileMap = new TileMap({
            name: data.name,
            pos: data.pos ? new Vector(data.pos.x, data.pos.y) : undefined,
            tileWidth: data.tileWidth,
            tileHeight: data.tileHeight,
            columns: data.columns,
            rows: data.rows,
            renderFromTopOfGraphic: data.renderFromTopOfGraphic
        });

        return tileMap;
    }

    /**
     * Process all layers in the map data
     */
    private processLayers(tileMap: TileMap, data: MapData): void {
        this.logger.debug(`Processing ${data.layers.length} layers`);

        // Process tile layers in order (bottom to top)
        const tileLayers = data.layers.filter((layer: LayerData) => layer.type === 'tile' && layer.visible);
        this.logger.debug(`Processing ${tileLayers.length} tile layers`);

        tileLayers.forEach((layer: LayerData, index: number) => {
            this.logger.debug(`Processing tile layer ${index + 1}/${tileLayers.length}: ${layer.name || 'unnamed'}`);
            this.processTileLayer(tileMap, layer);
        });

        // Process object layers after tiles
        const objectLayers = data.layers.filter((layer: LayerData) => layer.type === 'object' && layer.visible);
        this.logger.debug(`Processing ${objectLayers.length} object layers`);

        objectLayers.forEach((layer: LayerData, index: number) => {
            this.logger.debug(`Processing object layer ${index + 1}/${objectLayers.length}: ${layer.name || 'unnamed'}`);
            this.processObjectLayer(tileMap, layer);
        });
    }

    /**
     * Process a single tile layer
     */
    private processTileLayer(tileMap: TileMap, layer: LayerData): void {
        if (!layer.tiles || layer.tiles.length === 0) {
            this.logger.debug(`Layer ${layer.name || 'unnamed'} has no tiles`);
            return;
        }

        this.logger.debug(`Processing ${layer.tiles.length} tiles in layer ${layer.name || 'unnamed'}`);

        let tilesProcessed = 0;
        let tilesWithGraphics = 0;
        let tilesWithoutGraphics = 0;

        layer.tiles.forEach((tileData: TileDataMap) => {
            const tile = tileMap.getTile(tileData.x, tileData.y);
            if (tile) {
                tilesProcessed++;

                // Set basic tile properties
                tile.solid = tileData.solid ?? false;

                // Set custom properties
                if (tileData.properties) {
                    Object.entries(tileData.properties).forEach(([key, value]) => {
                        tile.data.set(key, value);
                    });
                }

                // Store the tile reference for later graphic assignment
                if (tileData.tileId !== undefined && tileData.tileSetId) {
                    this.logger.debug(`Mapping tile at (${tileData.x}, ${tileData.y}) to tileId ${tileData.tileId} from tileSet ${tileData.tileSetId}`);
                    this.tileToSpriteMap.set(tile, {
                        tileSetId: tileData.tileSetId,
                        tileId: tileData.tileId
                    });
                    tilesWithGraphics++;
                } else {
                    tilesWithoutGraphics++;
                    if (tileData.tileId === undefined) {
                        this.logger.debug(`Tile at (${tileData.x}, ${tileData.y}) has no tileId`);
                    }
                    if (!tileData.tileSetId) {
                        this.logger.debug(`Tile at (${tileData.x}, ${tileData.y}) has no tileSetId`);
                    }
                }

                // Add colliders if specified
                if (tileData.colliders && tileData.colliders.length > 0) {
                    this.logger.debug(`Tile at (${tileData.x}, ${tileData.y}) has ${tileData.colliders.length} colliders`);
                    // Here you would need to create the appropriate Excalibur collider
                    // based on the collider type and parameters
                }
            } else {
                this.logger.warn(`Could not get tile at position (${tileData.x}, ${tileData.y})`);
            }
        });

        this.logger.debug(`Processed ${tilesProcessed} tiles: ${tilesWithGraphics} with graphics references, ${tilesWithoutGraphics} without graphics`);
    }

    /**
     * Apply graphics to tiles based on the loaded tilesets
     */
    private applyTileGraphics(): void {
        this.logger.debug(`Applying graphics to ${this.tileToSpriteMap.size} tiles`);

        if (this.tileToSpriteMap.size === 0) {
            this.logger.warn('No tile references found to apply graphics to');
            return;
        }

        if (this.tileSetResources.size === 0) {
            this.logger.warn('No tileset resources loaded to get graphics from');
            return;
        }

        let successCount = 0;
        let animationCount = 0;
        let failCount = 0;
        let missingTileSetCount = 0;
        let missingTileIdCount = 0;

        // Log available tilesets for debugging
        this.logger.debug(`Available tilesets: ${Array.from(this.tileSetResources.keys()).join(', ')}`);

        // Log the first few tile references for debugging
        const firstFewTileRefs = Array.from(this.tileToSpriteMap.entries()).slice(0, 5);
        this.logger.debug(`First few tile references: ${JSON.stringify(firstFewTileRefs.map(([tile, ref]) => ({
            position: { x: tile.x, y: tile.y },
            tileSetId: ref.tileSetId,
            tileId: ref.tileId
        })))}`);

        for (const [tile, { tileSetId, tileId }] of this.tileToSpriteMap.entries()) {
            this.logger.debug(`Processing tile at (${tile.x}, ${tile.y}) with tileId ${tileId} from tileSet ${tileSetId}`);

            const tileSetResource = this.tileSetResources.get(tileSetId);

            if (!tileSetResource) {
                this.logger.warn(`TileSet resource not found for tileSetId ${tileSetId}`);
                missingTileSetCount++;
                failCount++;
                continue;
            }

            // Log available sprites and animations in this tileset
            this.logger.debug(`TileSet ${tileSetId} has ${Object.keys(tileSetResource.sprites).length} sprites and ${Object.keys(tileSetResource.animations).length} animations`);
            this.logger.debug(`Available sprite IDs: ${Object.keys(tileSetResource.sprites).slice(0, 10).join(', ')}${Object.keys(tileSetResource.sprites).length > 10 ? '...' : ''}`);

            // Check if this tile has an animation
            if (tileSetResource.animations[tileId]) {
                const animation = tileSetResource.animations[tileId];
                tile.addGraphic(animation);
                animationCount++;
                successCount++;
                this.logger.debug(`Added animation for tileId ${tileId} from tileSet ${tileSetId}`);
            }
            // Otherwise use a static sprite
            else if (tileSetResource.sprites[tileId]) {
                const sprite = tileSetResource.sprites[tileId];
                tile.addGraphic(sprite);
                successCount++;
                this.logger.debug(`Added sprite for tileId ${tileId} from tileSet ${tileSetId}`);
            } else {
                this.logger.warn(`Sprite not found for tileId ${tileId} in tileSet ${tileSetId}`);
                missingTileIdCount++;
                failCount++;
            }
        }

        this.logger.debug(`Graphics application complete: 
            - ${successCount} successful (${animationCount} animations)
            - ${failCount} failed
            - ${missingTileSetCount} missing tilesets
            - ${missingTileIdCount} missing tile IDs`);

        if (failCount > 0) {
            this.logger.warn(`Failed to apply graphics to ${failCount} tiles`);
        }
    }

    private processObjectLayer(tileMap: TileMap, layer: LayerData): void {
        if (!layer.objects || layer.objects.length === 0) {
            this.logger.debug(`Layer ${layer.name || 'unnamed'} has no objects`);
            return;
        }

        this.logger.debug(`Processing ${layer.objects.length} objects in layer ${layer.name || 'unnamed'}`);

        layer.objects.forEach((objData: any) => {
            this.logger.debug(`Processing object: ${JSON.stringify(objData)}`);
            // Convert object data to Excalibur entities/components
            // This could include:
            // - Collision areas
            // - Trigger zones
            // - Spawn points
            // - Custom game objects
        });
    }

    async load(): Promise<TileMap> {
        try {
            // Fetch the map data from the provided path
            const fullPath = joinPaths(this.basePath, this.filename);
            this.logger.debug(`Loading map from: ${fullPath}`);

            const response = await fetch(fullPath);
            if (!response.ok) {
                throw new Error(`Failed to load map from ${fullPath}: ${response.statusText}`);
            }

            this.mapData = await response.json() as MapData;
            this.logger.debug(`Loaded map data: ${JSON.stringify({
                name: this.mapData.name,
                tileWidth: this.mapData.tileWidth,
                tileHeight: this.mapData.tileHeight,
                columns: this.mapData.columns,
                rows: this.mapData.rows,
                layerCount: this.mapData.layers.length,
                tileSetCount: this.mapData.tileSets.length
            })}`);

            // Log the first few layers for debugging
            const firstFewLayers = this.mapData.layers.slice(0, 3);
            this.logger.debug(`First few layers: ${JSON.stringify(firstFewLayers.map(layer => ({
                id: layer.id,
                name: layer.name,
                type: layer.type,
                visible: layer.visible,
                tileCount: layer.tiles?.length || 0
            })))}`);

            // Create the TileMap structure
            this.tileMap = this.createTileMap(this.mapData);
            this.logger.debug(`Created TileMap with ${this.tileMap.tiles.length} tiles`);

            // Process all layers to set up tile properties and references
            this.processLayers(this.tileMap, this.mapData);
            this.logger.debug(`Processed layers, collected ${this.tileToSpriteMap.size} tile references`);

            if (this.tileToSpriteMap.size === 0) {
                this.logger.warn('No tile references collected from layers. Check if your map data contains valid tile references.');
            }

            // Load any external tilesets
            await this.loadExternalTileSets();
            this.logger.debug(`Loaded ${this.tileSetResources.size} external tilesets`);

            if (this.tileSetResources.size === 0) {
                this.logger.warn('No tilesets were loaded. Check if your map data contains valid tileset references.');
            }

            // Apply graphics to tiles now that all tilesets are loaded
            this.applyTileGraphics();

            // Verify that tiles have graphics
            let tilesWithGraphics = 0;
            for (const tile of this.tileMap.tiles) {
                if (tile.getGraphics().length > 0) {
                    tilesWithGraphics++;
                }
            }
            this.logger.debug(`Tiles with graphics after processing: ${tilesWithGraphics}/${this.tileMap.tiles.length}`);

            if (tilesWithGraphics === 0) {
                this.logger.warn('No tiles have graphics after processing. Check your tileset and map data.');
            }

            // Store the result
            this.data = this.tileMap;
            this.logger.debug(`Map loading complete`);

            return this.data;
        } catch (e) {
            this.logger.error(`Could not load map: ${e}`);
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
            this.logger.warn('Map is not loaded! Nothing will be added to the scene.');
            return;
        }

        // Add the tilemap to the scene
        this.logger.debug(`Adding tilemap to scene`);
        scene.add(this.data);
    }

    /**
     * Debug method to log the state of the map resource
     */
    debugInfo(): void {
        this.logger.info(`MapResource Debug Info:
            - Loaded: ${this.isLoaded()}
            - Base Path: ${this.basePath}
            - Filename: ${this.filename}
            - TileSets: ${this.tileSetResources.size}
            - Tile References: ${this.tileToSpriteMap.size}
        `);

        if (this.data) {
            this.logger.info(`TileMap Info:
                - Dimensions: ${this.data.columns}x${this.data.rows}
                - Tile Size: ${this.data.tileWidth}x${this.data.tileHeight}
                - Tile Count: ${this.data.tiles.length}
            `);
        }
    }
} 