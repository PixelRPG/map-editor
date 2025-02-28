import { Loadable, Scene, TileMap, Vector, Tile, Logger } from 'excalibur';
import { MapData, SpriteSetData, SpriteSetReference, LayerData, SpriteDataMap, MapFormat } from '@pixelrpg/map-format-core';
import { SpriteSetResource } from './SpriteSetResource';
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
    private tileSetResources: Map<string, SpriteSetResource> = new Map();
    private _mapData!: MapData;

    // Store tile data for easy access
    private tileMap!: TileMap;
    private tileToSpriteMap: Map<Tile, Array<{ spriteSetId: string, spriteId: number, animationId?: string, zIndex?: number }>> = new Map();

    // Store firstGid to spriteSetId mapping for quick lookup
    private firstGidToSpriteSetId: Map<number, string> = new Map();
    private sortedFirstGids: number[] = [];

    // Logger for debugging
    private logger = Logger.getInstance();

    public get mapData(): MapData {
        return this._mapData;
    }

    constructor(path: string, options?: MapResourceOptions) {
        this.headless = options?.headless ?? this.headless;
        this.basePath = extractDirectoryPath(path);
        this.filename = getFilename(path);
        this.logger.debug(`MapResource created with path: ${path}`);
    }

    /**
     * Checks if a spriteset entry is a reference to an external file
     */
    private isSpriteSetReference(tileSet: SpriteSetData | SpriteSetReference): tileSet is SpriteSetReference {
        return 'path' in tileSet && tileSet.type === 'spriteset';
    }

    /**
     * Initializes the firstGid to spriteSetId mapping for quick lookup
     */
    private initializeSpriteSetMapping(): void {
        // Get the tileset references from the map data
        const spriteSetRefs = this._mapData.spriteSets.filter(this.isSpriteSetReference);

        // Create a map of firstGid to spriteSetId for quick lookup
        for (const tileSetRef of spriteSetRefs) {
            if (tileSetRef.firstGid !== undefined) {
                this.firstGidToSpriteSetId.set(tileSetRef.firstGid, tileSetRef.id);
            }
        }

        // Sort firstGids in descending order for proper tileset identification
        this.sortedFirstGids = Array.from(this.firstGidToSpriteSetId.keys()).sort((a, b) => b - a);
    }

    /**
     * Calculates the local tile ID from a global tile ID by finding the correct tileset
     * and subtracting the firstGid
     * 
     * @param globalTileId The global tile ID from the map data
     * @returns An object containing the local tile ID and the tileset ID, or undefined if not found
     */
    private calculateLocalTileId(globalTileId: number): { localTileId: number, spriteSetId: string } | undefined {
        // Skip empty tiles
        if (globalTileId === 0 || globalTileId === undefined) {
            return undefined;
        }

        // Find the correct tileset for this tile ID based on the firstGid
        for (const firstGid of this.sortedFirstGids) {
            if (globalTileId >= firstGid) {
                const spriteSetId = this.firstGidToSpriteSetId.get(firstGid);
                if (spriteSetId) {
                    // Calculate the local tile ID by subtracting the firstGid
                    const localTileId = globalTileId - firstGid;
                    return { localTileId, spriteSetId };
                }
            }
        }

        this.logger.warn(`Could not find tileset for global tile ID ${globalTileId}`);
        return undefined;
    }

    /**
     * Loads the image for the tileset
     */
    private async loadExternalSpriteSets(): Promise<void> {
        const spriteSetRefs = this._mapData.spriteSets.filter(this.isSpriteSetReference);

        if (spriteSetRefs.length === 0) {
            this.logger.warn('No external tilesets found in map data');
            return;
        }

        const externalSpriteSetLoads = spriteSetRefs.map(async (tileSetRef: SpriteSetReference) => {
            try {
                // Join the base path with the tileset path
                const tileSetFullPath = joinPaths(this.basePath, tileSetRef.path);

                // Create a resource for the tileset
                const resource = new SpriteSetResource(tileSetFullPath, {
                    headless: this.headless
                });

                this.tileSetResources.set(tileSetRef.id, resource);

                // Load the resource
                await resource.load();

                return resource;
            } catch (e) {
                this.logger.error(`Error loading external tileset ${tileSetRef.path}:`, e);
                throw e;
            }
        });

        await Promise.all(externalSpriteSetLoads);
    }

    /**
     * Converts map data to Excalibur TileMap
     */
    private createTileMap(data: MapData): TileMap {
        MapFormat.validate(data);

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
        // Sort layers by z-index if available
        const sortedLayers = [...data.layers].sort((a, b) => {
            const zIndexA = Number(a.properties?.['z'] ?? 0);
            const zIndexB = Number(b.properties?.['z'] ?? 0);
            return zIndexA - zIndexB;
        });

        // Process tile layers in order (bottom to top)
        const tileLayers = sortedLayers.filter((layer: LayerData) => layer.type === 'tile' && layer.visible);

        tileLayers.forEach((layer: LayerData, index: number) => {
            const layerZIndex = layer.properties?.['z'] !== undefined ? Number(layer.properties['z']) : index;

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

        objectLayers.forEach((layer: LayerData, index: number) => {
            this.processObjectLayer(tileMap, layer);
        });
    }

    /**
     * Process a single tile layer
     */
    private processTileLayer(tileMap: TileMap, layer: LayerData, zIndex: number = 0): void {
        if (!layer.sprites || layer.sprites.length === 0) {
            return;
        }

        layer.sprites.forEach((spriteData: SpriteDataMap) => {
            const tile = tileMap.getTile(spriteData.x, spriteData.y);
            if (tile) {
                // Set basic tile properties
                tile.solid = spriteData.solid ?? false;

                // Set z-index for the tile
                tile.data.set('z-index', zIndex);

                // Set custom properties
                if (spriteData.properties) {
                    Object.entries(spriteData.properties).forEach(([key, value]) => {
                        tile.data.set(key, value);
                    });
                }

                // Store the tile reference for later graphic assignment
                if (spriteData.spriteId !== undefined) {
                    // If spriteSetId is provided directly in the tile data, use it
                    if (spriteData.spriteSetId) {
                        // Get existing references or create a new array
                        const existingRefs = this.tileToSpriteMap.get(tile) || [];

                        // Add the new reference
                        existingRefs.push({
                            spriteSetId: spriteData.spriteSetId,
                            spriteId: spriteData.spriteId,
                            animationId: spriteData.animationId,
                            zIndex: zIndex
                        });

                        // Store the updated array
                        this.tileToSpriteMap.set(tile, existingRefs);
                    }
                    // If no spriteSetId is provided but we have a global tile ID, calculate the local tile ID
                    else {
                        const tileInfo = this.calculateLocalTileId(spriteData.spriteId);

                        if (tileInfo) {
                            // Get existing references or create a new array
                            const existingRefs = this.tileToSpriteMap.get(tile) || [];

                            // Add the new reference
                            existingRefs.push({
                                spriteSetId: tileInfo.spriteSetId,
                                spriteId: tileInfo.localTileId,
                                animationId: spriteData.animationId,
                                zIndex: zIndex
                            });

                            // Store the updated array
                            this.tileToSpriteMap.set(tile, existingRefs);
                        }
                    }
                }

                // Add colliders if specified
                if (spriteData.colliders && spriteData.colliders.length > 0) {
                    // Here you would need to create the appropriate Excalibur collider
                    // based on the collider type and parameters
                }
            }
        });
    }

    /**
     * Apply graphics to tiles based on the loaded tilesets
     */
    private applyTileGraphics(): void {
        if (this.tileToSpriteMap.size === 0) {
            this.logger.warn('No tile references found to apply graphics to');
            return;
        }

        if (this.tileSetResources.size === 0) {
            this.logger.warn('No tileset resources loaded to get graphics from');
            return;
        }

        // Process each tile
        for (const [tile, tileRefs] of this.tileToSpriteMap.entries()) {
            // Sort the references by z-index to ensure proper layering (lowest z-index first)
            const sortedRefs = [...tileRefs].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

            // Clear any existing graphics on the tile
            tile.clearGraphics();

            // Apply each graphic in order
            for (const { spriteSetId, spriteId, animationId, zIndex } of sortedRefs) {
                const tileSetResource = this.tileSetResources.get(spriteSetId);

                if (!tileSetResource) {
                    this.logger.warn(`No tileset resource found for ID: ${spriteSetId}`);
                    continue;
                }

                // Check if this tile has an animation ID
                if (animationId && tileSetResource.animations[animationId]) {
                    const animation = tileSetResource.animations[animationId];
                    this.logger.debug(`Applying animation ${animationId} to tile at (${tile.x}, ${tile.y})`);

                    // Make sure the animation is properly initialized
                    animation.reset();

                    // Add the animation to the tile
                    tile.addGraphic(animation);

                    // Store z-index in the tile's data property
                    if (zIndex !== undefined) {
                        tile.data.set('z-index', zIndex);
                    }

                    // Store animation ID in the tile's data for reference
                    tile.data.set('animationId', animationId);
                }
                // Otherwise use a static sprite
                else if (tileSetResource.sprites[spriteId]) {
                    const sprite = tileSetResource.sprites[spriteId];

                    // If we have an animationId but couldn't find the animation, log a warning
                    if (animationId) {
                        this.logger.warn(`Animation ${animationId} not found in tileset ${spriteSetId}, using static sprite ${spriteId} instead`);
                    }

                    tile.addGraphic(sprite);

                    // Store z-index in the tile's data property
                    if (zIndex !== undefined) {
                        tile.data.set('z-index', zIndex);
                    }
                } else {
                    this.logger.warn(`No sprite found for ID ${spriteId} in tileset ${spriteSetId}`);
                }
            }
        }

        this.logger.info(`Applied graphics to ${this.tileToSpriteMap.size} tiles`);
    }

    private processObjectLayer(tileMap: TileMap, layer: LayerData): void {
        if (!layer.objects || layer.objects.length === 0) {
            return;
        }

        // Get map properties to adjust coordinates for infinite maps
        const originalMinX = this._mapData.properties?.originalMinX ?? 0;
        const originalMinY = this._mapData.properties?.originalMinY ?? 0;
        const isInfinite = this._mapData.properties?.infinite ?? false;

        layer.objects.forEach((objData: any) => {
            // Check if this is a tile object (has type 'sprite' and spriteId and spriteSetId)
            if (objData.type === 'sprite' && objData.spriteId !== undefined && objData.spriteSetId) {
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
                    tileX = tileX - Number(originalMinX);
                    tileY = tileY - Number(originalMinY);
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
                            spriteSetId: objData.spriteSetId,
                            spriteId: objData.spriteId,
                            animationId: objData.animationId,
                            zIndex: zIndex
                        });

                        // Store the updated array
                        this.tileToSpriteMap.set(tile, existingRefs);
                    }
                }
            }
        });
    }

    /**
     * Load the map resource
     */
    async load(): Promise<TileMap> {
        try {
            // Load the map data
            const mapDataPath = joinPaths(this.basePath, this.filename);
            const response = await fetch(mapDataPath);
            if (!response.ok) {
                throw new Error(`Failed to load map data: ${response.statusText}`);
            }

            this._mapData = await response.json();

            // Create the tile map
            this.tileMap = this.createTileMap(this._mapData);
            this.data = this.tileMap;

            // Initialize the tileset mapping
            this.initializeSpriteSetMapping();

            // Load external tilesets
            await this.loadExternalSpriteSets();

            // Process layers
            this.processLayers(this.tileMap, this._mapData);

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
            - SpriteSets: ${this.tileSetResources.size}
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