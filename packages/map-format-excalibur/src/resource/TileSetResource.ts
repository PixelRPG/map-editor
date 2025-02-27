import { ImageSource, Loadable, Sprite, Animation, SpriteSheet, AnimationStrategy, Logger, ImageFiltering, ImageWrapping } from 'excalibur';
import { TileSetData, TileSetFormat, TileDataTileSet } from '@pixelrpg/map-format-core';
import { TileSetResourceOptions } from '../types/TileSetResourceOptions';
import { extractDirectoryPath, getFilename, joinPaths } from '../utils';

/**
 * Resource class for loading custom TileSet format into Excalibur
 */
export class TileSetResource implements Loadable<TileSetData> {
    /**
     * The loaded tileset data
     */
    data!: TileSetData;

    /**
     * Configuration options
     */
    private readonly headless: boolean = false;
    private readonly basePath: string = '';
    private readonly filename: string = '';

    /**
     * Resource data
     */
    private imageLoader?: ImageSource;
    private tileSetData!: TileSetData;

    /**
     * Processed sprite data
     */
    public sprites: Record<number, Sprite> = {};
    public animations: Record<number, Animation> = {};
    public spriteSheet?: SpriteSheet;

    // Logger for debugging
    private logger = Logger.getInstance();

    constructor(path: string, options?: TileSetResourceOptions) {
        this.headless = options?.headless ?? this.headless;
        this.basePath = extractDirectoryPath(path);
        this.filename = getFilename(path);
    }

    /**
     * Creates a SpriteSheet from the tileset data
     */
    private createSpriteSheet(imageSource: ImageSource, data: TileSetData): SpriteSheet {
        this.logger.debug(`Creating SpriteSheet for tileset ${data.name || 'unnamed'}`);
        this.logger.debug(`Image dimensions: ${imageSource.width}x${imageSource.height}, tile size: ${data.tileWidth}x${data.tileHeight}, grid: ${data.columns}x${data.rows}`);

        const spriteSheet = SpriteSheet.fromImageSource({
            image: imageSource,
            grid: {
                rows: data.rows,
                columns: data.columns,
                spriteHeight: data.tileHeight,
                spriteWidth: data.tileWidth
            },
            spacing: data.spacing ? {
                margin: {
                    x: data.spacing,
                    y: data.spacing
                }
            } : undefined
        });

        this.logger.debug(`SpriteSheet created successfully`);
        return spriteSheet;
    }

    /**
     * Creates sprites from the tileset data and spritesheet
     */
    private createSprites(spriteSheet: SpriteSheet, data: TileSetData): Record<number, Sprite> {
        const sprites: Record<number, Sprite> = {};

        this.logger.debug(`Creating sprites for tileset ${data.name || 'unnamed'} with ${data.tiles.length} tiles`);
        this.logger.debug(`SpriteSheet created from image with dimensions: ${data.columns}x${data.rows}, sprite size: ${data.tileWidth}x${data.tileHeight}`);

        if (data.tiles.length === 0) {
            this.logger.warn('Tileset has no tiles defined');
            return sprites;
        }

        // Log the first few tiles for debugging
        const firstFewTiles = data.tiles.slice(0, 3);
        this.logger.debug(`First few tiles: ${JSON.stringify(firstFewTiles)}`);

        // Create a sprite for each tile in the tileset
        data.tiles.forEach((tile: TileDataTileSet) => {
            try {
                this.logger.debug(`Processing tile ID ${tile.id} at position (${tile.col}, ${tile.row})`);

                if (tile.col < 0 || tile.row < 0 ||
                    tile.col >= data.columns || tile.row >= data.rows) {
                    this.logger.warn(`Tile ID ${tile.id} has invalid position (${tile.col}, ${tile.row}). Skipping.`);
                    return;
                }

                this.logger.debug(`Getting sprite from spritesheet at position (${tile.col}, ${tile.row})`);
                const sprite = spriteSheet.getSprite(tile.col, tile.row);
                if (sprite) {
                    sprites[tile.id] = sprite;
                    this.logger.debug(`Created sprite for tile ID ${tile.id} at position (${tile.col}, ${tile.row})`);
                } else {
                    this.logger.warn(`Failed to get sprite for tile ID ${tile.id} at position (${tile.col}, ${tile.row})`);
                }
            } catch (error) {
                this.logger.error(`Error creating sprite for tile ID ${tile.id}: ${error}`);
            }
        });

        this.logger.debug(`Created ${Object.keys(sprites).length} sprites out of ${data.tiles.length} tiles`);

        // If no sprites were created, this is a serious problem
        if (Object.keys(sprites).length === 0) {
            this.logger.error('Failed to create any sprites from the tileset');
        }

        return sprites;
    }

    /**
     * Creates animations from the tileset data and sprites
     */
    private createAnimations(sprites: Record<number, Sprite>, data: TileSetData): Record<number, Animation> {
        const animations: Record<number, Animation> = {};

        data.tiles.forEach((tile: TileDataTileSet) => {
            if (tile.animation) {
                this.logger.debug(`Creating animation for tile ID ${tile.id} with ${tile.animation.frames.length} frames`);

                const frames = tile.animation.frames.map((frame: { tileId: number, duration: number }) => {
                    const sprite = sprites[frame.tileId];
                    if (!sprite) {
                        this.logger.warn(`Animation frame references missing sprite: tileId ${frame.tileId}`);
                    }
                    return {
                        graphic: sprite,
                        duration: frame.duration
                    };
                });

                animations[tile.id] = new Animation({
                    frames,
                    strategy: (tile.animation.strategy || 'loop') as AnimationStrategy
                });
            }
        });

        return animations;
    }

    /**
     * Loads the image for the tileset
     */
    private async loadImage(imagePath: string): Promise<ImageSource> {
        this.logger.debug(`Loading tileset image from: ${imagePath}`);

        // Check if the path is valid
        if (!imagePath) {
            throw new Error('Invalid image path: path is empty');
        }

        // Create the image source with transparency settings
        const imageLoader = new ImageSource(imagePath, {
            // Set filtering to preserve pixel art quality
            filtering: ImageFiltering.Pixel,
            // Ensure proper wrapping
            wrapping: ImageWrapping.Clamp
        });

        try {
            // Log image loading start
            this.logger.debug(`Starting to load image from: ${imagePath}`);

            // Load the image
            await imageLoader.load();

            // Check if the image was loaded successfully
            if (imageLoader.isLoaded()) {
                this.logger.debug(`Successfully loaded image from: ${imagePath} (size: ${imageLoader.width}x${imageLoader.height})`);
                return imageLoader;
            } else {
                throw new Error(`Image loaded but isLoaded() returned false: ${imagePath}`);
            }
        } catch (error) {
            this.logger.error(`Failed to load image from: ${imagePath}`, error);
            throw error;
        }
    }

    async load(): Promise<TileSetData> {
        try {
            // 1. Fetch the tileset data from the provided path
            const fullPath = joinPaths(this.basePath, this.filename);
            this.logger.debug(`Loading tileset from: ${fullPath}`);

            const response = await fetch(fullPath);
            if (!response.ok) {
                throw new Error(`Failed to load tileset from ${fullPath}: ${response.statusText}`);
            }

            // 2. Parse the tileset data
            this.tileSetData = await response.json() as TileSetData;
            this.logger.debug(`Loaded tileset data: ${JSON.stringify({
                name: this.tileSetData.name,
                tileWidth: this.tileSetData.tileWidth,
                tileHeight: this.tileSetData.tileHeight,
                columns: this.tileSetData.columns,
                rows: this.tileSetData.rows,
                tileCount: this.tileSetData.tiles.length,
                image: this.tileSetData.image
            })}`);

            // Validate the tileset data
            TileSetFormat.validate(this.tileSetData);

            // 3. In headless mode, we skip loading the actual image
            if (!this.headless && this.tileSetData.image) {
                // Join the base path with the image path
                const imagePath = joinPaths(this.basePath, this.tileSetData.image);
                this.logger.debug(`Resolved image path: ${imagePath}`);

                try {
                    // Load the image
                    this.imageLoader = await this.loadImage(imagePath);

                    // 4. Create the spritesheet
                    this.logger.debug(`Creating spritesheet from image (${this.imageLoader.width}x${this.imageLoader.height})`);
                    this.spriteSheet = this.createSpriteSheet(this.imageLoader, this.tileSetData);

                    if (!this.spriteSheet) {
                        throw new Error(`Failed to create spritesheet for tileset ${this.tileSetData.name}`);
                    }

                    // 5. Create sprites from the spritesheet
                    this.sprites = this.createSprites(this.spriteSheet, this.tileSetData);
                    this.logger.debug(`Created ${Object.keys(this.sprites).length} sprites`);

                    if (Object.keys(this.sprites).length === 0) {
                        this.logger.warn(`No sprites were created for tileset ${this.tileSetData.name}`);
                    }

                    // 6. Create animations from the sprites
                    this.animations = this.createAnimations(this.sprites, this.tileSetData);
                    this.logger.debug(`Created ${Object.keys(this.animations).length} animations`);
                } catch (error) {
                    this.logger.error(`Error processing tileset graphics: ${error}`);
                    // Continue without graphics in case of error
                    this.sprites = {};
                    this.animations = {};
                }
            } else {
                this.logger.debug(`Skipping image loading: headless=${this.headless}, has image=${!!this.tileSetData.image}`);
            }

            // Store the result
            this.data = this.tileSetData;

            // Final validation
            if (!this.headless && Object.keys(this.sprites).length === 0) {
                this.logger.warn(`Tileset ${this.tileSetData.name} loaded but no sprites were created`);
            }

            return this.data;
        } catch (e) {
            this.logger.error(`Could not load tileset: ${e}`);
            throw e;
        }
    }

    isLoaded(): boolean {
        return !!this.data;
    }
} 