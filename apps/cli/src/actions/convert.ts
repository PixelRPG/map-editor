import { promises as fs } from 'fs'
import { TileSetData, TileDataTileSet, MapData, LayerData } from '@pixelrpg/map-format-excalibur'
import { TiledParser, TiledMap, TiledTileLayer, TiledObjectLayer, TiledImageLayer, isTiledTilesetExternal, TiledObject } from '@excaliburjs/plugin-tiled'
import path from 'path'

export async function convertTiledToPixelRPG(input: string, output: string | null) {
    try {
        // Read input file
        const inputContent = await fs.readFile(input, 'utf-8')

        // Determine output path if not specified
        const outputPath = output || input.replace(/\.(tmx|tsx)$/, '.json')

        // Convert based on file type
        if (input.endsWith('.tsx')) {
            // Convert tileset
            const result = await convertTileset(inputContent)
            await fs.writeFile(outputPath, JSON.stringify(result, null, 2))
        } else if (input.endsWith('.tmx')) {
            // Convert map
            const result = await convertMap(inputContent, input)
            await fs.writeFile(outputPath, JSON.stringify(result, null, 2))
        } else {
            throw new Error('Unsupported input file type')
        }

        console.log(`Successfully converted ${input} to ${outputPath}`)
    } catch (error) {
        console.error('Error during conversion:', error)
        process.exit(1)
    }
}

async function convertTileset(content: string): Promise<TileSetData> {
    const parser = new TiledParser()
    const tiledTileset = parser.parseExternalTileset(content, false)

    // Convert only tiles that have special properties (animations)
    const tiles: TileDataTileSet[] = []

    if (tiledTileset.tiles) {
        for (const tile of tiledTileset.tiles) {
            if (tile.animation) {
                tiles.push({
                    id: tile.id,
                    col: tile.id % tiledTileset.columns,
                    row: Math.floor(tile.id / tiledTileset.columns),
                    animation: {
                        frames: tile.animation.map(frame => ({
                            tileId: frame.tileid,
                            duration: frame.duration
                        })),
                        strategy: 'loop' // Default in Tiled
                    }
                })
            }
        }
    }

    return {
        id: tiledTileset.name.toLowerCase().replace(/\s+/g, '_'),
        name: tiledTileset.name,
        image: tiledTileset.image ?? '',
        tileWidth: tiledTileset.tilewidth,
        tileHeight: tiledTileset.tileheight,
        columns: tiledTileset.columns,
        rows: Math.ceil(tiledTileset.tilecount / tiledTileset.columns),
        margin: tiledTileset.margin,
        spacing: tiledTileset.spacing,
        tiles
    }
}

async function convertMap(content: string, input: string): Promise<MapData> {
    const parser = new TiledParser()
    const tiledMap = parser.parse(content)

    // Convert layers
    const layers: LayerData[] = []
    for (const layer of tiledMap.layers) {
        if (layer.type === 'tilelayer') {
            const tileLayer = layer as TiledTileLayer
            const tileData = Array.isArray(tileLayer.data) ? tileLayer.data : []

            // Convert flat tile data array to TileDataMap array
            const tiles = tileData.map((tileId: number, index: number) => {
                if (tileId === 0) return null // Skip empty tiles
                return {
                    x: index % tiledMap.width,
                    y: Math.floor(index / tiledMap.width),
                    tileId: tileId - 1, // Tiled uses 1-based indices, we use 0-based
                    tileSetId: findTilesetIdForTileId(tileId, tiledMap.tilesets)
                }
            }).filter((tile: { x: number, y: number, tileId: number, tileSetId: string } | null): tile is { x: number, y: number, tileId: number, tileSetId: string } => tile !== null)

            layers.push({
                id: `layer_${tileLayer.id}`,
                name: tileLayer.name,
                type: 'tile',
                visible: tileLayer.visible,
                tiles
            })
        } else if (layer.type === 'objectgroup') {
            const objectLayer = layer as TiledObjectLayer
            layers.push({
                id: `layer_${objectLayer.id}`,
                name: objectLayer.name,
                type: 'object',
                visible: objectLayer.visible,
                objects: objectLayer.objects.map((obj: TiledObject) => ({
                    id: (obj.id ?? 0).toString(),
                    name: obj.name ?? '',
                    type: mapTiledTypeToObjectType(obj.type ?? ''),
                    x: obj.x ?? 0,
                    y: obj.y ?? 0,
                    width: obj.width ?? 0,
                    height: obj.height ?? 0,
                    properties: convertProperties(obj.properties)
                }))
            })
        }
    }

    // Load and convert external tilesets
    const tileSets: TileSetData[] = []
    for (const tileset of tiledMap.tilesets) {
        if (isTiledTilesetExternal(tileset)) {
            // Load external tileset
            const tsxPath = path.resolve(path.dirname(input), tileset.source)
            const tsxContent = await fs.readFile(tsxPath, 'utf-8')
            const externalTileset = parser.parseExternalTileset(tsxContent)

            // Convert external tileset
            const tileSetData = await convertTileset(tsxContent)
            tileSetData.id = externalTileset.name.toLowerCase().replace(/\s+/g, '_')
            tileSets.push(tileSetData)
        }
    }

    return {
        name: path.basename(input, path.extname(input)),
        version: '1.0.0',
        tileWidth: tiledMap.tilewidth,
        tileHeight: tiledMap.tileheight,
        columns: tiledMap.width,
        rows: tiledMap.height,
        tileSets,
        layers,
        properties: convertProperties(tiledMap.properties)
    }
}

function findTilesetIdForTileId(globalTileId: number, tilesets: TiledMap['tilesets']): string {
    // Find the tileset that contains this tile ID
    let targetTileset = tilesets[0]
    for (const tileset of tilesets) {
        const firstGid = 'firstgid' in tileset ? tileset.firstgid ?? 0 : 0
        const targetFirstGid = targetTileset && 'firstgid' in targetTileset ? targetTileset.firstgid ?? 0 : 0

        if ('firstgid' in tileset && firstGid <= globalTileId) {
            if (!targetTileset || !('firstgid' in targetTileset) || firstGid > targetFirstGid) {
                targetTileset = tileset
            }
        }
    }

    if (!targetTileset || !('source' in targetTileset)) {
        throw new Error(`Could not find tileset for tile ID ${globalTileId}`)
    }

    // Convert tileset source path to tileset ID
    const tilesetName = path.basename(targetTileset.source, '.tsx')
    return tilesetName.toLowerCase().replace(/\s+/g, '_')
}

function convertProperties(properties?: { name: string, type: string, value: any }[]): Record<string, any> | undefined {
    if (!properties) return undefined

    const result: Record<string, any> = {}
    for (const prop of properties) {
        result[prop.name] = prop.value
    }
    return result
}

// Add type mapping function
function mapTiledTypeToObjectType(tiledType: string): 'collider' | 'trigger' | 'spawn' | 'custom' {
    switch (tiledType?.toLowerCase()) {
        case 'collider':
            return 'collider'
        case 'trigger':
            return 'trigger'
        case 'spawn':
            return 'spawn'
        default:
            return 'custom'
    }
} 