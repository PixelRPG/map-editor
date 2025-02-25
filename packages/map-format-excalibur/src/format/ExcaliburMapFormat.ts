import { TileMap, Vector } from 'excalibur';
import { MapFormat, MapData, LayerData, TileDataMap } from '@pixelrpg/map-format-core';

export class ExcaliburMapFormat extends MapFormat {
    /**
     * Converts map data to Excalibur TileMap
     */
    static toExcalibur(data: MapData): TileMap {
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

        // Process tile layers in order (bottom to top)
        data.layers
            .filter((layer: LayerData) => layer.type === 'tile' && layer.visible)
            .forEach((layer: LayerData) => {
                this.processTileLayer(tileMap, layer);
            });

        // Process object layers after tiles
        data.layers
            .filter((layer: LayerData) => layer.type === 'object' && layer.visible)
            .forEach((layer: LayerData) => {
                this.processObjectLayer(tileMap, layer);
            });

        return tileMap;
    }

    private static processTileLayer(tileMap: TileMap, layer: LayerData): void {
        layer.tiles?.forEach((tileData: TileDataMap) => {
            const tile = tileMap.getTile(tileData.x, tileData.y);
            if (tile) {
                // Set basic tile properties
                tile.solid = tileData.solid ?? false;

                // Set custom properties
                if (tileData.properties) {
                    Object.entries(tileData.properties).forEach(([key, value]) => {
                        tile.data.set(key, value);
                    });
                }

                // Add colliders if specified
                tileData.colliders?.forEach((collider: any) => {
                    // Here you would need to create the appropriate Excalibur collider
                    // based on the collider type and parameters
                });
            }
        });
    }

    private static processObjectLayer(tileMap: TileMap, layer: LayerData): void {
        layer.objects?.forEach((objData: any) => {
            // Convert object data to Excalibur entities/components
            // This could include:
            // - Collision areas
            // - Trigger zones
            // - Spawn points
            // - Custom game objects
        });
    }
} 