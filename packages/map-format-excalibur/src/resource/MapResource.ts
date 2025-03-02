import { Loadable, Scene, TileMap, Vector, Tile, Logger } from 'excalibur';
import { MapData, SpriteSetReference, LayerData, MapFormat, ObjectData, SpriteDataMap } from '@pixelrpg/map-format-core';
import { SpriteSetResource } from './SpriteSetResource.ts';
import { MapResourceOptions } from '../types/MapResourceOptions.ts';
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
     * Loads the sprite sets referenced in the map
     */
    private async loadSpriteSets(): Promise<void> {
        const spriteSetRefs = this._mapData.spriteSets || [];

        if (spriteSetRefs.length === 0) {
            this.logger.warn('No sprite sets found in map data');
            return;
        }

        // Load each sprite set
        for (const spriteSetRef of spriteSetRefs) {
            try {
                const fullPath = joinPaths(this.basePath, spriteSetRef.path);
                const resource = new SpriteSetResource(fullPath, {
                    headless: this.headless
                });
                await resource.load();

                this.tileSetResources.set(spriteSetRef.id, resource);
                this.logger.debug(`Loaded sprite set: ${spriteSetRef.id} from ${fullPath}`);
            } catch (error) {
                this.logger.error(`Failed to load sprite set ${spriteSetRef.id}: ${error}`);
                throw error;
            }
        }

        this.logger.debug(`Loaded ${this.tileSetResources.size} sprite sets`);
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
        const tileLayers = sortedLayers.filter(layer => layer.type === 'tile' && layer.visible);
        tileLayers.forEach(layer => this.processTileLayer(tileMap, layer));

        // Process object layers
        const objectLayers = sortedLayers.filter(layer => layer.type === 'object' && layer.visible);
        objectLayers.forEach(layer => this.processObjectLayer(tileMap, layer));
    }

    /**
     * Process a single tile layer
     */
    private processTileLayer(tileMap: TileMap, layer: LayerData): void {
        if (!layer.sprites || !Array.isArray(layer.sprites) || layer.sprites.length === 0) {
            this.logger.warn(`Skipping layer ${layer.name}: No sprites found`);
            return;
        }

        // Get the layer z-index from properties (default to 0)
        const layerZIndex = layer.properties?.['z'] !== undefined ? Number(layer.properties['z']) : 0;

        // Process each sprite in the layer
        for (const spriteData of layer.sprites) {
            // Skip if outside map bounds
            if (spriteData.x < 0 || spriteData.x >= tileMap.columns ||
                spriteData.y < 0 || spriteData.y >= tileMap.rows) {
                continue;
            }

            // Skip if no sprite ID or sprite set ID
            if (spriteData.spriteId === undefined || !spriteData.spriteSetId) {
                continue;
            }

            // Get the tile and set up the reference
            const tile = tileMap.getTile(spriteData.x, spriteData.y);
            if (tile) {
                // Apply any custom properties to the tile
                if (spriteData.properties) {
                    Object.entries(spriteData.properties).forEach(([key, value]) => {
                        tile.data.set(key, value);
                    });
                }

                // Set solid property if defined
                if (spriteData.solid !== undefined) {
                    tile.solid = spriteData.solid;
                }

                // Store the sprite reference for rendering
                const existingRefs = this.tileToSpriteMap.get(tile) || [];
                existingRefs.push({
                    spriteSetId: spriteData.spriteSetId,
                    spriteId: spriteData.spriteId,
                    animationId: spriteData.animationId,
                    zIndex: spriteData.zIndex !== undefined ? spriteData.zIndex : layerZIndex
                });
                this.tileToSpriteMap.set(tile, existingRefs);
            }
        }
    }

    /**
     * Process a single object layer
     */
    private processObjectLayer(tileMap: TileMap, layer: LayerData): void {
        if (!layer.objects || !Array.isArray(layer.objects) || layer.objects.length === 0) {
            return;
        }

        // Get the layer z-index from properties (default to 0)
        const layerZIndex = layer.properties?.['z'] !== undefined ? Number(layer.properties['z']) : 0;

        // Process each object in the layer
        for (const obj of layer.objects) {
            // Skip objects that aren't sprites
            if (obj.type !== 'sprite' || obj.spriteId === undefined || !obj.spriteSetId) {
                continue;
            }

            // Calculate tile position in the grid
            const tileX = Math.floor(obj.x / tileMap.tileWidth);
            const tileY = Math.floor(obj.y / tileMap.tileHeight);

            // Skip if outside map bounds
            if (tileX < 0 || tileX >= tileMap.columns || tileY < 0 || tileY >= tileMap.rows) {
                continue;
            }

            // Create object data
            const objData = {
                id: obj.id,
                name: obj.name,
                type: obj.type,
                x: obj.x,
                y: obj.y,
                width: obj.width,
                height: obj.height,
                properties: obj.properties,
                spriteId: obj.spriteId,
                spriteSetId: obj.spriteSetId,
                animationId: obj.animationId
            };

            // Get the tile at this position
            const tile = tileMap.getTile(tileX, tileY);

            if (tile) {
                // Store the object data in the tile for interaction
                tile.data.set('object', objData);

                // Get existing references or create a new array
                const existingRefs = this.tileToSpriteMap.get(tile) || [];

                // Add the new reference with a z-index to ensure proper layering
                const zIndex = obj.zIndex !== undefined ? obj.zIndex : layerZIndex;
                existingRefs.push({
                    spriteSetId: obj.spriteSetId,
                    spriteId: obj.spriteId,
                    animationId: obj.animationId,
                    zIndex: zIndex
                });

                // Store the updated array
                this.tileToSpriteMap.set(tile, existingRefs);
            }
        }
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

            // Load sprite sets
            await this.loadSpriteSets();

            // Process layers
            this.processLayers(this.tileMap, this._mapData);

            return this.tileMap;
        } catch (error) {
            this.logger.error(`Failed to load map: ${error}`);
            throw error;
        }
    }

    /**
     * Apply sprites to tiles based on the stored references
     */
    private applySpritesToTiles(): void {
        this.tileToSpriteMap.forEach((refs, tile) => {
            // Sort by z-index
            const sortedRefs = [...refs].sort((a, b) => {
                const aZ = a.zIndex ?? 0;
                const bZ = b.zIndex ?? 0;
                return aZ - bZ;
            });

            // Apply the bottom-most sprite to the tile
            if (sortedRefs.length > 0) {
                const bottomRef = sortedRefs[0];
                const spriteSet = this.tileSetResources.get(bottomRef.spriteSetId);

                if (spriteSet) {
                    if (bottomRef.animationId && spriteSet.animations[bottomRef.animationId]) {
                        // If an animation is specified, use that
                        tile.addGraphic(spriteSet.animations[bottomRef.animationId].clone());
                    } else if (spriteSet.sprites[bottomRef.spriteId]) {
                        // Otherwise use the static sprite
                        tile.addGraphic(spriteSet.sprites[bottomRef.spriteId].clone());
                    }
                }

                // Apply any additional sprites with higher z-indexes as overlays
                for (let i = 1; i < sortedRefs.length; i++) {
                    const ref = sortedRefs[i];
                    const spriteSet = this.tileSetResources.get(ref.spriteSetId);

                    if (spriteSet) {
                        if (ref.animationId && spriteSet.animations[ref.animationId]) {
                            // If an animation is specified, use that
                            tile.addGraphic(spriteSet.animations[ref.animationId].clone());
                        } else if (spriteSet.sprites[ref.spriteId]) {
                            // Otherwise use the static sprite
                            tile.addGraphic(spriteSet.sprites[ref.spriteId].clone());
                        }
                    }
                }
            }
        });
    }

    /**
     * Add the loaded map to a scene
     */
    addToScene(scene: Scene): void {
        if (!this.tileMap) {
            throw new Error('Map resource not loaded');
        }

        // Apply sprites to tiles based on the stored references
        this.applySpritesToTiles();

        // Add the map to the scene
        scene.add(this.tileMap);
    }

    /**
     * Check if the resource is loaded
     */
    isLoaded(): boolean {
        return !!this.data;
    }
} 