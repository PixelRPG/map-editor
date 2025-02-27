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

        // Ensure all sprites in the sheet have proper transparency settings
        for (let row = 0; row < data.rows; row++) {
            for (let col = 0; col < data.columns; col++) {
                const sprite = spriteSheet.getSprite(col, row);
                if (sprite) {
                    // Make sure the sprite preserves transparency
                    sprite.destSize.width = data.tileWidth;
                    sprite.destSize.height = data.tileHeight;
                }
            }
        }

        return spriteSheet;
    }

    /**
     * Creates sprites from the tileset data and spritesheet
     */
    private createSprites(spriteSheet: SpriteSheet, data: TileSetData): Record<number, Sprite> {
        const sprites: Record<number, Sprite> = {};

        if (data.tiles.length === 0) {
            this.logger.warn('Tileset has no tiles defined');
            return sprites;
        }

        // Create a sprite for each tile in the tileset
        data.tiles.forEach((tile: TileDataTileSet) => {
            try {
                if (tile.col < 0 || tile.row < 0 ||
                    tile.col >= data.columns || tile.row >= data.rows) {
                    this.logger.warn(`Tile ID ${tile.id} has invalid position (${tile.col}, ${tile.row}). Skipping.`);
                    return;
                }

                const sprite = spriteSheet.getSprite(tile.col, tile.row);
                if (sprite) {
                    sprites[tile.id] = sprite;
                } else {
                    this.logger.warn(`Failed to get sprite for tile ID ${tile.id} at position (${tile.col}, ${tile.row})`);
                }
            } catch (error) {
                this.logger.error(`Error creating sprite for tile ID ${tile.id}: ${error}`);
            }
        });

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
            // Load the image
            await imageLoader.load();

            // Check if the image was loaded successfully
            if (imageLoader.isLoaded()) {
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

            const response = await fetch(fullPath);
            if (!response.ok) {
                throw new Error(`Failed to load tileset from ${fullPath}: ${response.statusText}`);
            }

            // 2. Parse the tileset data
            this.tileSetData = await response.json() as TileSetData;

            // Validate the tileset data
            TileSetFormat.validate(this.tileSetData);

            // 3. In headless mode, we skip loading the actual image
            if (!this.headless && this.tileSetData.image) {
                // Join the base path with the image path
                const imagePath = joinPaths(this.basePath, this.tileSetData.image);

                try {
                    // Load the image
                    this.imageLoader = await this.loadImage(imagePath);

                    // 4. Create the spritesheet
                    this.spriteSheet = this.createSpriteSheet(this.imageLoader, this.tileSetData);

                    if (!this.spriteSheet) {
                        throw new Error(`Failed to create spritesheet for tileset ${this.tileSetData.name}`);
                    }

                    // 5. Create sprites from the spritesheet
                    this.sprites = this.createSprites(this.spriteSheet, this.tileSetData);

                    if (Object.keys(this.sprites).length === 0) {
                        this.logger.warn(`No sprites were created for tileset ${this.tileSetData.name}`);
                    }

                    // 6. Create animations from the sprites
                    this.animations = this.createAnimations(this.sprites, this.tileSetData);
                } catch (error) {
                    this.logger.error(`Error processing tileset graphics: ${error}`);
                    // Continue without graphics in case of error
                    this.sprites = {};
                    this.animations = {};
                }
            }

            // Store the result
            this.data = this.tileSetData;

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