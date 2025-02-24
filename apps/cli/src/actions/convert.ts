import { promises as fs } from 'fs'
import { XMLParser } from 'fast-xml-parser'
import { TileSetData, TileDataTileSet, MapData, LayerData } from '@pixelrpg/map-format'
import { TiledParser, TiledMap, TiledTileLayer, TiledObjectLayer, TiledImageLayer, isTiledTilesetExternal, TiledObject } from '@excaliburjs/plugin-tiled'
import path from 'path'

interface TiledTileset {
    tileset: {
        '@_version': string
        '@_tiledversion': string
        '@_name': string
        '@_tilewidth': number
        '@_tileheight': number
        '@_tilecount': number
        '@_columns': number
        image: {
            '@_source': string
            '@_width': number
            '@_height': number
        }
        tile?: {
            '@_id': string
            animation?: {
                frame: Array<{
                    '@_tileid': string
                    '@_duration': string
                }> | {
                    '@_tileid': string
                    '@_duration': string
                }
            }
        }[]
    }
}

interface PixelRPGTileset {
    name: string
    image: string
    tileWidth: number
    tileHeight: number
    tileCount: number
    columns: number
    animations: Record<string, Array<{ tileId: number, duration: number }>>
}

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
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_'
    })

    const tiled = parser.parse(content) as TiledTileset
    const { tileset } = tiled

    // Create tiles array only for tiles with special properties
    const tiles: TileDataTileSet[] = []

    // Only process tiles that have special properties
    if (tileset.tile) {
        const tiledTiles = Array.isArray(tileset.tile) ? tileset.tile : [tileset.tile]

        for (const tile of tiledTiles) {
            const tileId = parseInt(tile['@_id'])
            const tileData: TileDataTileSet = {
                id: tileId,
                col: tileId % tileset['@_columns'],
                row: Math.floor(tileId / tileset['@_columns'])
            }

            // Add animation if it exists
            if (tile.animation) {
                const frames = Array.isArray(tile.animation.frame)
                    ? tile.animation.frame
                    : [tile.animation.frame]

                tileData.animation = {
                    frames: frames.map(frame => ({
                        tileId: parseInt(frame['@_tileid']),
                        duration: parseInt(frame['@_duration'])
                    })),
                    strategy: 'loop' // Default strategy in Tiled
                }
            }

            // Only add tile if it has special properties
            if (tile.animation) {
                tiles.push(tileData)
            }
        }
    }

    return {
        id: tileset['@_name'].toLowerCase().replace(/\s+/g, '_'),
        name: tileset['@_name'],
        image: tileset.image['@_source'],
        tileWidth: tileset['@_tilewidth'],
        tileHeight: tileset['@_tileheight'],
        columns: tileset['@_columns'],
        rows: Math.ceil(tileset['@_tilecount'] / tileset['@_columns']),
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