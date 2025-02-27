import { promises as fs } from 'fs'
import { TileSetData, TileDataTileSet, MapData, LayerData, TileSetReference } from '@pixelrpg/map-format-excalibur'
import { TiledParser, TiledMap, TiledTileLayer, TiledObjectLayer, TiledImageLayer, isTiledTilesetExternal, TiledObject } from '@excaliburjs/plugin-tiled'
import path from 'path'

export async function convertTiledToPixelRPG(input: string, output: string | null) {
    console.log('=== USING UPDATED CONVERTER WITH TILESET REFERENCES ===')
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

            // Also convert and save all referenced tilesets
            await convertReferencedTilesets(inputContent, input)
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

    // Convert all tiles, not just those with animations
    const tiles: TileDataTileSet[] = []

    // Create entries for all tiles in the tileset
    for (let id = 0; id < tiledTileset.tilecount; id++) {
        tiles.push({
            id,
            col: id % tiledTileset.columns,
            row: Math.floor(id / tiledTileset.columns)
        })
    }

    // Add animation data for tiles that have it
    if (tiledTileset.tiles) {
        for (const tile of tiledTileset.tiles) {
            const existingTile = tiles.find(t => t.id === tile.id)

            if (existingTile && tile.animation) {
                existingTile.animation = {
                    frames: tile.animation.map(frame => ({
                        tileId: frame.tileid,
                        duration: frame.duration
                    })),
                    strategy: 'loop' // Default in Tiled
                }
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

// Helper function to convert and save all referenced tilesets
async function convertReferencedTilesets(content: string, input: string): Promise<void> {
    const parser = new TiledParser()
    const tiledMap = parser.parse(content)

    for (const tileset of tiledMap.tilesets) {
        if (isTiledTilesetExternal(tileset)) {
            // Load external tileset
            const tsxPath = path.resolve(path.dirname(input), tileset.source)
            console.log(`Loading external tileset from: ${tsxPath}`)

            const tsxContent = await fs.readFile(tsxPath, 'utf-8')

            // Convert external tileset
            const tileSetData = await convertTileset(tsxContent)

            // Determine output path for the tileset
            const tilesetOutputPath = tsxPath.replace(/\.tsx$/, '.json')

            // Save the tileset
            await fs.writeFile(tilesetOutputPath, JSON.stringify(tileSetData, null, 2))
            console.log(`Saved tileset to: ${tilesetOutputPath}`)
        }
    }
}

async function convertMap(content: string, input: string): Promise<MapData> {
    const parser = new TiledParser()
    const tiledMap = parser.parse(content)

    console.log(`Converting map: ${path.basename(input)}`)
    console.log(`Map is infinite: ${tiledMap.infinite}`)
    console.log(`Map dimensions: ${tiledMap.width}x${tiledMap.height}`)
    console.log(`Tile dimensions: ${tiledMap.tilewidth}x${tiledMap.tileheight}`)
    console.log(`Layers: ${tiledMap.layers.length}`)
    console.log(`Tilesets: ${tiledMap.tilesets.length}`)

    // Calculate the actual bounds of the map for infinite maps
    let minX = 0, minY = 0, maxX = tiledMap.width, maxY = tiledMap.height;

    // For infinite maps, we need to calculate the actual bounds by examining all chunks
    if (tiledMap.infinite) {
        for (const layer of tiledMap.layers) {
            if (layer.type === 'tilelayer') {
                const tileLayer = layer as TiledTileLayer;
                if ('chunks' in tileLayer && tileLayer.chunks) {
                    for (const chunk of tileLayer.chunks) {
                        minX = Math.min(minX, chunk.x);
                        minY = Math.min(minY, chunk.y);
                        maxX = Math.max(maxX, chunk.x + chunk.width);
                        maxY = Math.max(maxY, chunk.y + chunk.height);
                    }
                }
            }
        }
        console.log(`Calculated map bounds: (${minX}, ${minY}) to (${maxX}, ${maxY})`);
    }

    // Convert layers
    const layers: LayerData[] = []
    for (let layerIndex = 0; layerIndex < tiledMap.layers.length; layerIndex++) {
        const layer = tiledMap.layers[layerIndex];
        if (layer.type === 'tilelayer') {
            const tileLayer = layer as TiledTileLayer

            // Handle infinite maps with chunks
            if (tiledMap.infinite && 'chunks' in tileLayer) {
                console.log(`Processing infinite layer: ${tileLayer.name} with ${tileLayer.chunks.length} chunks`)

                const tiles = []

                // Process each chunk
                for (const chunk of tileLayer.chunks) {
                    console.log(`Processing chunk at (${chunk.x}, ${chunk.y}) with dimensions ${chunk.width}x${chunk.height}`)

                    const chunkData = Array.isArray(chunk.data) ? chunk.data : []

                    // Convert chunk data to tile objects
                    for (let i = 0; i < chunkData.length; i++) {
                        const globalTileId = chunkData[i]
                        if (globalTileId === 0) continue // Skip empty tiles

                        // Calculate position within the chunk
                        const localX = i % chunk.width
                        const localY = Math.floor(i / chunk.width)

                        // Calculate global position
                        const x = chunk.x + localX
                        const y = chunk.y + localY

                        // Adjust coordinates to be non-negative for Excalibur
                        const adjustedX = x - minX
                        const adjustedY = y - minY

                        // Calculate the local tile ID within the tileset
                        const localTileId = calculateLocalTileId(globalTileId, tiledMap.tilesets)

                        tiles.push({
                            x: adjustedX,
                            y: adjustedY,
                            tileId: localTileId, // Use the local tile ID
                            tileSetId: findTilesetIdForTileId(globalTileId, tiledMap.tilesets)
                        })
                    }
                }

                layers.push({
                    id: `layer_${tileLayer.id}`,
                    name: tileLayer.name,
                    type: 'tile',
                    visible: tileLayer.visible,
                    tiles,
                    properties: {
                        ...convertProperties(tileLayer.properties),
                        z: layerIndex // Add z-index based on layer order
                    }
                })
            } else {
                // Handle regular non-infinite layers
                const tileData = Array.isArray(tileLayer.data) ? tileLayer.data : []
                console.log(`Processing regular layer: ${tileLayer.name} with ${tileData.length} tiles`)

                // Convert flat tile data array to TileDataMap array
                const tiles = tileData.map((globalTileId: number, index: number) => {
                    if (globalTileId === 0) return null // Skip empty tiles

                    // Calculate the local tile ID within the tileset
                    const localTileId = calculateLocalTileId(globalTileId, tiledMap.tilesets)

                    return {
                        x: index % tiledMap.width,
                        y: Math.floor(index / tiledMap.width),
                        tileId: localTileId, // Use the local tile ID
                        tileSetId: findTilesetIdForTileId(globalTileId, tiledMap.tilesets)
                    }
                }).filter((tile: { x: number, y: number, tileId: number, tileSetId: string } | null): tile is { x: number, y: number, tileId: number, tileSetId: string } => tile !== null)

                layers.push({
                    id: `layer_${tileLayer.id}`,
                    name: tileLayer.name,
                    type: 'tile',
                    visible: tileLayer.visible,
                    tiles,
                    properties: {
                        ...convertProperties(tileLayer.properties),
                        z: layerIndex // Add z-index based on layer order
                    }
                })
            }
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
                })),
                properties: {
                    ...convertProperties(objectLayer.properties),
                    z: layerIndex // Add z-index based on layer order
                }
            })
        }
    }

    // Create tileset references instead of embedding them
    const tileSetReferences: TileSetReference[] = []
    for (const tileset of tiledMap.tilesets) {
        if (isTiledTilesetExternal(tileset)) {
            // Get the tileset name from the source
            const tilesetName = path.basename(tileset.source, '.tsx')
            const tilesetId = tilesetName.toLowerCase().replace(/\s+/g, '_')

            // Create a relative path to the JSON tileset
            const relativePath = path.relative(
                path.dirname(input),
                path.join(path.dirname(path.resolve(path.dirname(input), tileset.source)), `${tilesetName}.json`)
            )

            // Create a reference to the tileset
            tileSetReferences.push({
                id: tilesetId,
                path: relativePath,
                type: 'tileset',
                firstGid: tileset.firstgid
            })

            console.log(`Created reference to tileset: ${tilesetId} at ${relativePath}`)
        }
    }

    // For infinite maps, adjust the map dimensions to include all chunks
    const mapWidth = tiledMap.infinite ? (maxX - minX) : tiledMap.width;
    const mapHeight = tiledMap.infinite ? (maxY - minY) : tiledMap.height;

    return {
        name: path.basename(input, path.extname(input)),
        version: '1.0.0',
        tileWidth: tiledMap.tilewidth,
        tileHeight: tiledMap.tileheight,
        columns: mapWidth,
        rows: mapHeight,
        tileSets: tileSetReferences,
        layers,
        properties: {
            ...convertProperties(tiledMap.properties),
            infinite: tiledMap.infinite,
            originalMinX: minX,
            originalMinY: minY
        }
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

// Add a function to calculate the local tile ID within a tileset
function calculateLocalTileId(globalTileId: number, tilesets: TiledMap['tilesets']): number {
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

    if (!targetTileset || !('firstgid' in targetTileset)) {
        throw new Error(`Could not find tileset for tile ID ${globalTileId}`)
    }

    // Calculate the local tile ID by subtracting the firstGid
    const firstGid = targetTileset.firstgid ?? 0;
    return globalTileId - firstGid;
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