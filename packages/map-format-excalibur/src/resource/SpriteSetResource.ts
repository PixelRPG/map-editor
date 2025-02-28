import { ImageSource, Loadable, Sprite, Animation, SpriteSheet, AnimationStrategy, Logger, ImageFiltering, ImageWrapping } from 'excalibur';
import { SpriteSetData, SpriteDataSet, AnimationData, SpriteSetFormat } from '@pixelrpg/map-format-core';
import { SpriteSetResourceOptions } from '../types/SpriteSetResourceOptions';
import { extractDirectoryPath, getFilename, joinPaths } from '../utils';

/**
 * Resource class for loading custom SpriteSet format into Excalibur
 */
export class SpriteSetResource implements Loadable<SpriteSetData> {
    /**
     * The loaded sprite set data
     */
    data!: SpriteSetData;

    /**
     * Configuration options
     */
    private readonly headless: boolean = false;
    private readonly basePath: string = '';
    private readonly filename: string = '';

    /**
     * Resource data
     */
    private imageLoaders: Map<string, ImageSource> = new Map();
    private spriteSetData!: SpriteSetData;

    /**
     * Processed sprite data
     */
    public sprites: Record<number, Sprite> = {};
    public animations: Record<string, Animation> = {};
    public spriteSheets: Map<string, SpriteSheet> = new Map();

    // Logger for debugging
    private logger = Logger.getInstance();

    constructor(path: string, options?: SpriteSetResourceOptions) {
        this.headless = options?.headless ?? this.headless;
        this.basePath = extractDirectoryPath(path);
        this.filename = getFilename(path);
    }

    /**
     * Creates a SpriteSheet from the sprite set data
     */
    private createSpriteSheet(imageSource: ImageSource, imageId: string, data: SpriteSetData): SpriteSheet {
        // Determine the grid dimensions based on whether we're using legacy or new format
        let rows = 0;
        let columns = 0;
        let tileWidth = 0;
        let tileHeight = 0;
        let spacing = undefined;

        // Check if we're using the new images array
        if (data.images) {
            const imageData = data.images.find(img => img.id === imageId);
            if (imageData) {
                rows = imageData.rows;
                columns = imageData.columns;
                tileWidth = imageData.spriteWidth;
                tileHeight = imageData.spriteHeight;
                spacing = imageData.spacing ? {
                    margin: {
                        x: imageData.spacing,
                        y: imageData.spacing
                    }
                } : undefined;
            }
        }
        // Otherwise use the legacy fields
        else {
            this.logger.warn('SpriteSet has no images defined');
        }

        const spriteSheet = SpriteSheet.fromImageSource({
            image: imageSource,
            grid: {
                rows,
                columns,
                spriteHeight: tileHeight,
                spriteWidth: tileWidth
            },
            spacing
        });

        // Ensure all sprites in the sheet have proper transparency settings
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < columns; col++) {
                const sprite = spriteSheet.getSprite(col, row);
                if (sprite) {
                    // Make sure the sprite preserves transparency
                    sprite.destSize.width = tileWidth;
                    sprite.destSize.height = tileHeight;
                }
            }
        }

        return spriteSheet;
    }

    /**
     * Creates sprites from the sprite set data and spritesheet
     */
    private createSprites(data: SpriteSetData): Record<number, Sprite> {
        const sprites: Record<number, Sprite> = {};

        if (data.sprites.length === 0) {
            this.logger.warn('SpriteSet has no sprites defined');
            return sprites;
        }

        // Create a sprite for each sprite in the sprite set
        data.sprites.forEach((sprite: SpriteDataSet) => {
            try {
                // Determine which spritesheet to use
                let spriteSheet: SpriteSheet | undefined;
                let imageId = 'default';

                // If using the new format with multiple images
                if (data.images && data.images.length > 0) {
                    // Check if the sprite has an imageId property
                    const spriteImageId = sprite.properties?.['imageId'] as string;
                    if (spriteImageId && this.spriteSheets.has(spriteImageId)) {
                        imageId = spriteImageId;
                    } else {
                        // Default to the first image
                        imageId = data.images[0].id;
                    }
                }

                spriteSheet = this.spriteSheets.get(imageId);

                if (!spriteSheet) {
                    this.logger.warn(`No spritesheet found for image ID ${imageId}`);
                    return;
                }

                if (sprite.col < 0 || sprite.row < 0 ||
                    sprite.col >= spriteSheet.columns || sprite.row >= spriteSheet.rows) {
                    this.logger.warn(`Sprite ID ${sprite.id} has invalid position (${sprite.col}, ${sprite.row}). Skipping.`);
                    return;
                }

                const spriteGraphic = spriteSheet.getSprite(sprite.col, sprite.row);
                if (spriteGraphic) {
                    sprites[sprite.id] = spriteGraphic;
                } else {
                    this.logger.warn(`Failed to get sprite for sprite ID ${sprite.id} at position (${sprite.col}, ${sprite.row})`);
                }
            } catch (error) {
                this.logger.error(`Error creating sprite for sprite ID ${sprite.id}: ${error}`);
            }
        });

        // If no sprites were created, this is a serious problem
        if (Object.keys(sprites).length === 0) {
            this.logger.error('Failed to create any sprites from the sprite set');
        }

        return sprites;
    }

    /**
     * Creates animations from the sprite set data and sprites
     */
    private createAnimations(sprites: Record<number, Sprite>, data: SpriteSetData): Record<string, Animation> {
        const animations: Record<string, Animation> = {};

        if (data.animations && data.animations.length > 0) {
            data.animations.forEach((animation: AnimationData) => {
                // Filter out frames with missing sprites
                const validFrames = animation.frames.filter(frame => {
                    const hasSprite = !!sprites[frame.spriteId];
                    if (!hasSprite) {
                        this.logger.warn(`Animation ${animation.id} frame references missing sprite: spriteId ${frame.spriteId}`);
                    }
                    return hasSprite;
                });

                if (validFrames.length === 0) {
                    this.logger.warn(`Animation ${animation.id} has no valid frames after filtering`);
                    return;
                }

                // Create animation frames with proper cloning of sprites to avoid reference issues
                const frames = validFrames.map(frame => {
                    const sprite = sprites[frame.spriteId];
                    // Create a clone of the sprite to ensure each frame has its own instance
                    const spriteClone = this.cloneSprite(sprite, data);

                    return {
                        graphic: spriteClone,
                        duration: frame.duration
                    };
                });

                this.logger.debug(`Creating animation ${animation.id} with ${frames.length} frames`);

                // Create the animation with the frames
                animations[animation.id] = new Animation({
                    frames,
                    strategy: animation.strategy as AnimationStrategy
                });

                // Log the created animation for debugging
                this.logger.debug(`Animation ${animation.id} created with strategy ${animation.strategy}`);
            });
        }

        this.logger.info(`Created ${Object.keys(animations).length} animations`);
        return animations;
    }

    /**
     * Creates a clone of a sprite with the same properties
     */
    private cloneSprite(sprite: Sprite, data: SpriteSetData): Sprite {
        // Get the sprite dimensions from the first image source
        let spriteWidth = 16;
        let spriteHeight = 16;

        if (data.images && data.images.length > 0) {
            const imageData = data.images[0];
            spriteWidth = imageData.spriteWidth;
            spriteHeight = imageData.spriteHeight;
        }

        // Create a new sprite with the same texture
        const clonedSprite = new Sprite({
            image: sprite.image,
            sourceView: {
                x: sprite.sourceView.x,
                y: sprite.sourceView.y,
                width: sprite.sourceView.width,
                height: sprite.sourceView.height
            },
            destSize: {
                width: spriteWidth,
                height: spriteHeight
            }
        });

        return clonedSprite;
    }

    /**
     * Loads the images for the sprite set
     */
    private async loadImages(data: SpriteSetData): Promise<Map<string, ImageSource>> {
        const imageLoaders = new Map<string, ImageSource>();

        // If using the new images array
        if (data.images && data.images.length > 0) {
            for (const imageData of data.images) {
                const imagePath = joinPaths(this.basePath, imageData.path);
                try {
                    const imageLoader = await this.loadImage(imagePath);
                    imageLoaders.set(imageData.id, imageLoader);
                } catch (error) {
                    this.logger.error(`Failed to load image ${imageData.id} from: ${imagePath}`, error);
                }
            }
        }
        else {
            this.logger.warn('SpriteSet has no images defined');
        }

        return imageLoaders;
    }

    /**
     * Loads a single image
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

    async load(): Promise<SpriteSetData> {
        try {
            // 1. Fetch the sprite set data from the provided path
            const fullPath = joinPaths(this.basePath, this.filename);
            this.logger.debug(`Loading sprite set from: ${fullPath}`);

            const response = await fetch(fullPath);
            if (!response.ok) {
                throw new Error(`Failed to load sprite set from ${fullPath}: ${response.statusText}`);
            }

            // 2. Parse the sprite set data
            this.spriteSetData = await response.json() as SpriteSetData;
            this.logger.debug(`Loaded sprite set: ${this.spriteSetData.name} (${this.spriteSetData.id})`);

            // Validate the sprite set data
            SpriteSetFormat.validate(this.spriteSetData);

            // 3. In headless mode, we skip loading the actual images
            if (!this.headless) {
                try {
                    // Load all images
                    this.imageLoaders = await this.loadImages(this.spriteSetData);
                    this.logger.debug(`Loaded ${this.imageLoaders.size} images`);

                    // Create spritesheets for each image
                    for (const [imageId, imageLoader] of this.imageLoaders.entries()) {
                        const spriteSheet = this.createSpriteSheet(imageLoader, imageId, this.spriteSetData);
                        this.spriteSheets.set(imageId, spriteSheet);
                    }
                    this.logger.debug(`Created ${this.spriteSheets.size} spritesheets`);

                    // Create sprites from the spritesheets
                    this.sprites = this.createSprites(this.spriteSetData);
                    this.logger.debug(`Created ${Object.keys(this.sprites).length} sprites`);

                    if (Object.keys(this.sprites).length === 0) {
                        this.logger.warn(`No sprites were created for sprite set ${this.spriteSetData.name}`);
                    }

                    // Create animations from the sprites
                    this.animations = this.createAnimations(this.sprites, this.spriteSetData);
                    this.logger.debug(`Created ${Object.keys(this.animations).length} animations`);

                    // Initialize all animations
                    for (const [animId, animation] of Object.entries(this.animations)) {
                        animation.reset();
                        this.logger.debug(`Initialized animation: ${animId}`);
                    }
                } catch (error) {
                    this.logger.error(`Error processing sprite set graphics: ${error}`);
                    // Continue without graphics in case of error
                    this.sprites = {};
                    this.animations = {};
                }
            }

            // Store the result
            this.data = this.spriteSetData;

            return this.data;
        } catch (e) {
            this.logger.error(`Could not load sprite set: ${e}`);
            throw e;
        }
    }

    isLoaded(): boolean {
        return !!this.data;
    }
} 