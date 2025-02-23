import { TileMap, Vector } from 'excalibur';
import { MapData, LayerData, TileData } from '../types';

export class MapFormat {
    /**
     * Validates map data structure
     */
    static validate(data: MapData): boolean {
        if (!data.version) {
            throw new Error('Map version is required');
        }
        if (!data.tileWidth || !data.tileHeight) {
            throw new Error('Tile dimensions are required');
        }
        if (!data.columns || !data.rows) {
            throw new Error('Map dimensions (columns/rows) are required');
        }
        if (!Array.isArray(data.layers)) {
            throw new Error('Layers must be an array');
        }
        return true;
    }

    /**
     * Converts map data to Excalibur TileMap
     */
    static toTileMap(data: MapData): TileMap {
        this.validate(data);

        const tileMap = new TileMap({
            name: data.name,
            pos: data.pos ? new Vector(data.pos.x, data.pos.y) : undefined,
            tileWidth: data.tileWidth,
            tileHeight: data.tileHeight,
            columns: data.columns,
            rows: data.rows,
            renderFromTopOfGraphic: data.renderFromTopOfGraphic
        });

        // Process tile layers in order (bottom to top)
        data.layers
            .filter(layer => layer.type === 'tile' && layer.visible)
            .forEach(layer => {
                this.processTileLayer(tileMap, layer);
            });

        // Process object layers after tiles
        data.layers
            .filter(layer => layer.type === 'object' && layer.visible)
            .forEach(layer => {
                this.processObjectLayer(tileMap, layer);
            });

        return tileMap;
    }

    /**
     * Converts Excalibur TileMap to map data
     */
    static fromTileMap(tileMap: TileMap): MapData {
        return {
            version: '1.0',
            name: tileMap.name,
            pos: tileMap.pos ? { x: tileMap.pos.x, y: tileMap.pos.y } : undefined,
            tileWidth: tileMap.tileWidth,
            tileHeight: tileMap.tileHeight,
            columns: tileMap.columns,
            rows: tileMap.rows,
            renderFromTopOfGraphic: tileMap.renderFromTopOfGraphic,
            layers: [
                {
                    id: 'base',
                    name: 'Base Layer',
                    type: 'tile',
                    visible: true,
                    tiles: this.extractTiles(tileMap)
                }
            ]
        };
    }

    private static processTileLayer(tileMap: TileMap, layer: LayerData) {
        layer.tiles?.forEach(tileData => {
            const tile = tileMap.getTile(tileData.x, tileData.y);
            if (tile) {
                // Set basic tile properties
                tile.solid = tileData.solid ?? false;

                // Add graphics if specified
                tileData.graphics?.forEach(graphicRef => {
                    // Here you would need to resolve the graphic reference
                    // to an actual Excalibur Graphic instance
                    // tile.addGraphic(resolveGraphic(graphicRef));
                });

                // Set custom properties
                if (tileData.properties) {
                    Object.entries(tileData.properties).forEach(([key, value]) => {
                        tile.data.set(key, value);
                    });
                }

                // Add colliders if specified
                tileData.colliders?.forEach(collider => {
                    // Here you would need to create the appropriate Excalibur collider
                    // based on the collider type and parameters
                    // tile.addCollider(createCollider(collider));
                });
            }
        });
    }

    private static processObjectLayer(tileMap: TileMap, layer: LayerData) {
        layer.objects?.forEach(objData => {
            // Convert object data to Excalibur entities/components
            // This could include:
            // - Collision areas
            // - Trigger zones
            // - Spawn points
            // - Custom game objects
        });
    }

    private static extractTiles(tileMap: TileMap): TileData[] {
        const tiles: TileData[] = [];

        for (let x = 0; x < tileMap.columns; x++) {
            for (let y = 0; y < tileMap.rows; y++) {
                const tile = tileMap.getTile(x, y);
                if (tile) {
                    // Extract basic tile data
                    const tileData: TileData = {
                        x: tile.x,
                        y: tile.y,
                        solid: tile.solid
                    };

                    // Extract graphics
                    const graphics = tile.getGraphics();
                    if (graphics.length > 0) {
                        tileData.graphics = graphics.map(g => g.id.toString());
                    }

                    // Extract custom properties
                    if (tile.data.size > 0) {
                        tileData.properties = Object.fromEntries(tile.data.entries());
                    }

                    // Extract colliders
                    const colliders = tile.getColliders();
                    if (colliders.length > 0) {
                        tileData.colliders = colliders.map(c => ({
                            type: c.constructor.name,
                            // Additional collider properties would be extracted here
                        }));
                    }

                    tiles.push(tileData);
                }
            }
        }

        return tiles;
    }

    /**
     * Serializes map data to JSON string
     */
    static serialize(data: MapData): string {
        this.validate(data);
        return JSON.stringify(data, null, 2);
    }

    /**
     * Deserializes JSON string to map data
     */
    static deserialize(json: string): MapData {
        const data = JSON.parse(json) as MapData;
        this.validate(data);
        return data;
    }
}