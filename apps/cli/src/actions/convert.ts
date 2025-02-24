import { promises as fs } from 'fs'
import { XMLParser } from 'fast-xml-parser'
import { TileSetData, TileDataTileSet } from '@pixelrpg/map-format'

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
            const result = await convertMap(inputContent)
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

async function convertMap(content: string) {
    // TODO: Implement map conversion  
    throw new Error('Map conversion not implemented yet')
} 