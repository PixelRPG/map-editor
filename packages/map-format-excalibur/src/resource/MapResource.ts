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
    private tileToSpriteMap: Map<Tile, Array<{ tileSetId: string, tileId: number, zIndex?: number }>> = new Map();

    // Store firstGid to tileSetId mapping for quick lookup
    private firstGidToTileSetId: Map<number, string> = new Map();
    private sortedFirstGids: number[] = [];

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

    /**
     * Initializes the firstGid to tileSetId mapping for quick lookup
     */
    private initializeTileSetMapping(): void {
        this.logger.debug('Initializing tileset mapping...');

        // Get the tileset references from the map data
        const tileSetRefs = this.mapData.tileSets.filter(this.isTileSetReference);

        // Create a map of firstGid to tileSetId for quick lookup
        for (const tileSetRef of tileSetRefs) {
            if (tileSetRef.firstGid !== undefined) {
                this.firstGidToTileSetId.set(tileSetRef.firstGid, tileSetRef.id);
                this.logger.debug(`Mapped firstGid ${tileSetRef.firstGid} to tileSetId ${tileSetRef.id}`);
            }
        }

        // Sort firstGids in descending order for proper tileset identification
        this.sortedFirstGids = Array.from(this.firstGidToTileSetId.keys()).sort((a, b) => b - a);

        this.logger.debug(`TileSet firstGids (sorted): ${this.sortedFirstGids.join(', ')}`);
    }

    /**
     * Calculates the local tile ID from a global tile ID by finding the correct tileset
     * and subtracting the firstGid
     * 
     * @param globalTileId The global tile ID from the map data
     * @returns An object containing the local tile ID and the tileset ID, or undefined if not found
     */
    private calculateLocalTileId(globalTileId: number): { localTileId: number, tileSetId: string } | undefined {
        // Skip empty tiles
        if (globalTileId === 0 || globalTileId === undefined) {
            return undefined;
        }

        // Find the correct tileset for this tile ID based on the firstGid
        for (const firstGid of this.sortedFirstGids) {
            if (globalTileId >= firstGid) {
                const tileSetId = this.firstGidToTileSetId.get(firstGid);
                if (tileSetId) {
                    // Calculate the local tile ID by subtracting the firstGid
                    const localTileId = globalTileId - firstGid;
                    this.logger.debug(`Global tile ID ${globalTileId} belongs to tileset ${tileSetId} with local ID ${localTileId} (firstGid: ${firstGid})`);
                    return { localTileId, tileSetId };
                }
            }
        }

        this.logger.warn(`Could not find tileset for global tile ID ${globalTileId}`);
        return undefined;
    }

    /**
     * Loads the image for the tileset
     */
    private async loadExternalTileSets(): Promise<void> {
        this.logger.debug(`Loading external tilesets...`);

        const tileSetRefs = this.mapData.tileSets.filter(this.isTileSetReference);
        this.logger.debug(`Found ${tileSetRefs.length} external tileset references`);

        if (tileSetRefs.length === 0) {
            this.logger.warn('No external tilesets found in map data');
            return;
        }

        // Log all tileset references for debugging
        tileSetRefs.forEach((ref, index) => {
            this.logger.debug(`Tileset reference ${index + 1}/${tileSetRefs.length}: id=${ref.id}, path=${ref.path}, firstGid=${ref.firstGid}`);
        });

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

                // Log the range of sprite IDs
                if (Object.keys(resource.sprites).length > 0) {
                    const allIds = Object.keys(resource.sprites).map(id => parseInt(id));
                    const minId = Math.min(...allIds);
                    const maxId = Math.max(...allIds);
                    this.logger.debug(`Sprite ID range for tileset ${tileSetRef.id}: ${minId} to ${maxId}`);
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

        // Sort layers by z-index if available
        const sortedLayers = [...data.layers].sort((a, b) => {
            const zIndexA = a.properties?.['z'] ?? 0;
            const zIndexB = b.properties?.['z'] ?? 0;
            return zIndexA - zIndexB;
        });

        this.logger.debug(`Layers sorted by z-index: ${sortedLayers.map(l => `${l.name}(z:${l.properties?.['z'] ?? 0})`).join(', ')}`);

        // Process tile layers in order (bottom to top)
        const tileLayers = sortedLayers.filter((layer: LayerData) => layer.type === 'tile' && layer.visible);
        this.logger.debug(`Processing ${tileLayers.length} tile layers`);

        tileLayers.forEach((layer: LayerData, index: number) => {
            const layerZIndex = layer.properties?.['z'] !== undefined ? Number(layer.properties['z']) : index;
            this.logger.debug(`Processing tile layer ${index + 1}/${tileLayers.length}: ${layer.name || 'unnamed'} (z-index: ${layerZIndex})`);

            // Process the layer
            this.processTileLayer(tileMap, layer, layerZIndex);

            // Set the z-index on the TileMap for proper rendering order
            if (layerZIndex !== undefined) {
                // Store the z-index in the tile map's data for reference
                tileMap.data.set('z-index', layerZIndex);
            }
        });

        // Process object layers after tiles
        const objectLayers = sortedLayers.filter((layer: LayerData) => layer.type === 'object' && layer.visible);
        this.logger.debug(`Processing ${objectLayers.length} object layers`);

        objectLayers.forEach((layer: LayerData, index: number) => {
            const layerZIndex = layer.properties?.['z'] !== undefined ? Number(layer.properties['z']) : index;
            this.logger.debug(`Processing object layer ${index + 1}/${objectLayers.length}: ${layer.name || 'unnamed'} (z-index: ${layerZIndex})`);
            this.processObjectLayer(tileMap, layer);
        });
    }

    /**
     * Process a single tile layer
     */
    private processTileLayer(tileMap: TileMap, layer: LayerData, zIndex: number = 0): void {
        if (!layer.tiles || layer.tiles.length === 0) {
            this.logger.debug(`Layer ${layer.name || 'unnamed'} has no tiles`);
            return;
        }

        this.logger.debug(`Processing ${layer.tiles.length} tiles in layer ${layer.name || 'unnamed'} with z-index ${zIndex}`);

        let tilesProcessed = 0;
        let tilesWithGraphics = 0;
        let tilesWithoutGraphics = 0;

        layer.tiles.forEach((tileData: TileDataMap) => {
            const tile = tileMap.getTile(tileData.x, tileData.y);
            if (tile) {
                tilesProcessed++;

                // Set basic tile properties
                tile.solid = tileData.solid ?? false;

                // Set z-index for the tile
                tile.data.set('z-index', zIndex);

                // Set custom properties
                if (tileData.properties) {
                    Object.entries(tileData.properties).forEach(([key, value]) => {
                        tile.data.set(key, value);
                    });
                }

                // Store the tile reference for later graphic assignment
                if (tileData.tileId !== undefined) {
                    // If tileSetId is provided directly in the tile data, use it
                    if (tileData.tileSetId) {
                        this.logger.debug(`Mapping tile at (${tileData.x}, ${tileData.y}) to tileId ${tileData.tileId} from tileSet ${tileData.tileSetId}`);

                        // Get existing references or create a new array
                        const existingRefs = this.tileToSpriteMap.get(tile) || [];

                        // Add the new reference
                        existingRefs.push({
                            tileSetId: tileData.tileSetId,
                            tileId: tileData.tileId,
                            zIndex: zIndex
                        });

                        // Store the updated array
                        this.tileToSpriteMap.set(tile, existingRefs);

                        tilesWithGraphics++;
                    }
                    // If no tileSetId is provided but we have a global tile ID, calculate the local tile ID
                    else {
                        const tileInfo = this.calculateLocalTileId(tileData.tileId);

                        if (tileInfo) {
                            this.logger.debug(`Mapping tile at (${tileData.x}, ${tileData.y}) to local tileId ${tileInfo.localTileId} from tileSet ${tileInfo.tileSetId}`);

                            // Get existing references or create a new array
                            const existingRefs = this.tileToSpriteMap.get(tile) || [];

                            // Add the new reference
                            existingRefs.push({
                                tileSetId: tileInfo.tileSetId,
                                tileId: tileInfo.localTileId,
                                zIndex: zIndex
                            });

                            // Store the updated array
                            this.tileToSpriteMap.set(tile, existingRefs);

                            tilesWithGraphics++;
                        } else {
                            tilesWithoutGraphics++;
                            this.logger.debug(`Could not find tileset for tile ID ${tileData.tileId} at (${tileData.x}, ${tileData.y})`);
                        }
                    }
                } else {
                    tilesWithoutGraphics++;
                    this.logger.debug(`Tile at (${tileData.x}, ${tileData.y}) has no tileId`);
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

        // For each tileset, log the available sprite IDs
        for (const [tileSetId, tileSetResource] of this.tileSetResources.entries()) {
            const spriteIds = Object.keys(tileSetResource.sprites);
            this.logger.debug(`Tileset ${tileSetId} has ${spriteIds.length} sprites with IDs: ${spriteIds.length > 20 ?
                `${spriteIds.slice(0, 10).join(', ')}... (and ${spriteIds.length - 10} more)` :
                spriteIds.join(', ')}`);
        }

        // Process each tile
        for (const [tile, tileRefs] of this.tileToSpriteMap.entries()) {
            // Sort the references by z-index to ensure proper layering (lowest z-index first)
            const sortedRefs = [...tileRefs].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

            this.logger.debug(`Processing tile at (${tile.x}, ${tile.y}) with ${sortedRefs.length} graphics references`);

            // Clear any existing graphics on the tile
            tile.clearGraphics();

            // Apply each graphic in order
            for (const { tileSetId, tileId, zIndex } of sortedRefs) {
                this.logger.debug(`Applying graphic: tileId ${tileId} from tileSet ${tileSetId}, z-index: ${zIndex ?? 0}`);

                const tileSetResource = this.tileSetResources.get(tileSetId);

                if (!tileSetResource) {
                    this.logger.warn(`TileSet resource not found for tileSetId ${tileSetId}`);
                    missingTileSetCount++;
                    failCount++;
                    continue;
                }

                // Check if this tile has an animation
                if (tileSetResource.animations[tileId]) {
                    const animation = tileSetResource.animations[tileId];
                    tile.addGraphic(animation);

                    // Store z-index in the tile's data property
                    if (zIndex !== undefined) {
                        tile.data.set('z-index', zIndex);
                    }

                    animationCount++;
                    successCount++;
                    this.logger.debug(`Added animation for tileId ${tileId} from tileSet ${tileSetId} with z-index ${zIndex ?? 0}`);
                }
                // Otherwise use a static sprite
                else if (tileSetResource.sprites[tileId]) {
                    const sprite = tileSetResource.sprites[tileId];
                    tile.addGraphic(sprite);

                    // Store z-index in the tile's data property
                    if (zIndex !== undefined) {
                        tile.data.set('z-index', zIndex);
                    }

                    successCount++;
                    this.logger.debug(`Added sprite for tileId ${tileId} from tileSet ${tileSetId} with z-index ${zIndex ?? 0}`);
                } else {
                    this.logger.warn(`Sprite not found for tileId ${tileId} in tileSet ${tileSetId}`);
                    // Log available sprite IDs for this tileset to help diagnose the issue
                    const availableSpriteIds = Object.keys(tileSetResource.sprites);
                    if (availableSpriteIds.length > 0) {
                        const minId = Math.min(...availableSpriteIds.map(id => parseInt(id)));
                        const maxId = Math.max(...availableSpriteIds.map(id => parseInt(id)));
                        this.logger.debug(`Available sprite IDs for tileset ${tileSetId} range from ${minId} to ${maxId}`);
                    } else {
                        this.logger.debug(`No sprites available in tileset ${tileSetId}`);
                    }
                    missingTileIdCount++;
                    failCount++;
                }
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

        let tileObjectsCount = 0;
        let regularObjectsCount = 0;

        // Get map properties to adjust coordinates for infinite maps
        const originalMinX = this.mapData.properties?.originalMinX ?? 0;
        const originalMinY = this.mapData.properties?.originalMinY ?? 0;
        const isInfinite = this.mapData.properties?.infinite ?? false;

        this.logger.debug(`Map properties: originalMinX=${originalMinX}, originalMinY=${originalMinY}, isInfinite=${isInfinite}`);

        layer.objects.forEach((objData: any) => {
            // Check if this is a tile object (has type 'tile' and tileId and tileSetId)
            if (objData.type === 'tile' && objData.tileId !== undefined && objData.tileSetId) {
                tileObjectsCount++;
                this.logger.debug(`Processing tile object: id=${objData.id}, tileId=${objData.tileId}, tileSetId=${objData.tileSetId}`);

                // Create a tile at the object's position
                // Note: In Tiled, object coordinates refer to the bottom-left corner of the object,
                // but in our system we use the top-left corner, so we need to adjust the y-coordinate
                const adjustedY = objData.y - objData.height;

                // Convert object position to tile coordinates
                let tileX = Math.floor(objData.x / this.mapData.tileWidth);
                let tileY = Math.floor(adjustedY / this.mapData.tileHeight);

                // For infinite maps, adjust coordinates to be non-negative
                if (isInfinite) {
                    // Adjust coordinates based on the original map bounds
                    tileX = tileX - originalMinX;
                    tileY = tileY - originalMinY;
                    this.logger.debug(`Adjusted tile object position from (${Math.floor(objData.x / this.mapData.tileWidth)}, ${Math.floor(adjustedY / this.mapData.tileHeight)}) to (${tileX}, ${tileY})`);
                }

                // Check if the position is within the map bounds
                if (tileX >= 0 && tileX < tileMap.columns && tileY >= 0 && tileY < tileMap.rows) {
                    const tile = tileMap.getTile(tileX, tileY);

                    if (tile) {
                        // Store the object data in the tile for interaction
                        tile.data.set('object', objData);

                        // Get existing references or create a new array
                        const existingRefs = this.tileToSpriteMap.get(tile) || [];

                        // Add the new reference with a higher z-index to ensure it renders above regular tiles
                        const zIndex = layer.properties?.['z'] !== undefined ? Number(layer.properties['z']) : 0;
                        existingRefs.push({
                            tileSetId: objData.tileSetId,
                            tileId: objData.tileId,
                            zIndex: zIndex
                        });

                        // Store the updated array
                        this.tileToSpriteMap.set(tile, existingRefs);

                        this.logger.debug(`Added tile object at (${tileX}, ${tileY}) with tileId ${objData.tileId} from tileSet ${objData.tileSetId}`);
                    } else {
                        this.logger.warn(`Could not get tile at position (${tileX}, ${tileY}) for tile object`);
                    }
                } else {
                    this.logger.warn(`Tile object position (${tileX}, ${tileY}) is outside map bounds`);
                }
            } else {
                regularObjectsCount++;
                this.logger.debug(`Processing regular object: ${JSON.stringify(objData)}`);
                // Handle regular non-tile objects (collision areas, trigger zones, etc.)
                // This would involve creating appropriate Excalibur entities/components
            }
        });

        this.logger.debug(`Processed ${tileObjectsCount} tile objects and ${regularObjectsCount} regular objects in layer ${layer.name || 'unnamed'}`);
    }

    /**
     * Load the map resource
     */
    async load(): Promise<TileMap> {
        try {
            this.logger.debug(`Loading map resource: ${this.filename}`);

            // Load the map data
            const mapDataPath = joinPaths(this.basePath, this.filename);
            const response = await fetch(mapDataPath);
            if (!response.ok) {
                throw new Error(`Failed to load map data: ${response.statusText}`);
            }

            this.mapData = await response.json();
            this.logger.debug(`Map data loaded: ${this.mapData.name}, ${this.mapData.columns}x${this.mapData.rows}`);

            // Create the tile map
            this.tileMap = this.createTileMap(this.mapData);
            this.data = this.tileMap;

            // Initialize the tileset mapping
            this.initializeTileSetMapping();

            // Load external tilesets
            await this.loadExternalTileSets();

            // Process layers
            this.processLayers(this.tileMap, this.mapData);

            // Apply graphics to tiles
            this.applyTileGraphics();

            return this.tileMap;
        } catch (e) {
            this.logger.error('Error loading map resource:', e);
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