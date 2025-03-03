import Gio from '@girs/gio-2.0';
import Gtk from '@girs/gtk-4.0';
import GLib from '@girs/glib-2.0';
import GdkPixbuf from '@girs/gdkpixbuf-2.0';
import Pango from '@girs/pango-1.0';
import {
    SpriteSetData,
    SpriteSetFormat,
    ResourceProvider,
    ResourceEventEmitter,
    SpriteSetResourceOptions
} from '@pixelrpg/data-core';
import { pathUtils } from '../utils/index';

/**
 * GJS Provider for SpriteSet data
 * Loads and manages sprite set data for GTK applications
 */
export class SpriteSetProvider implements ResourceProvider<SpriteSetData>, ResourceEventEmitter {
    /**
     * The loaded sprite set data
     */
    private spriteSetData!: SpriteSetData;

    /**
     * Flag to indicate if the resource is loaded
     */
    private _isLoaded: boolean = false;

    /**
     * Signal handlers for sprite set events
     */
    private signalHandlers: Map<string, Set<(...args: any[]) => void>> = new Map();

    /**
     * Path to the sprite set file
     */
    private filePath: string = '';

    /**
     * Cached sprite images
     */
    private spriteImages: Map<string, GdkPixbuf.Pixbuf> = new Map();

    /**
     * Static factory method to create a SpriteSetProvider from a file
     * @param path Path to the sprite set file
     * @param options Options for the sprite set provider
     * @returns Promise resolving to a SpriteSetProvider
     */
    static async fromFile(path: string, options?: SpriteSetResourceOptions): Promise<SpriteSetProvider> {
        const provider = new SpriteSetProvider();
        await provider.loadFromFile(path);
        return provider;
    }

    /**
     * Static factory method to create a SpriteSetProvider from data
     * @param data The sprite set data
     * @param options Options for the sprite set provider
     * @returns Promise resolving to a SpriteSetProvider
     */
    static async fromData(data: SpriteSetData, options?: SpriteSetResourceOptions): Promise<SpriteSetProvider> {
        const provider = new SpriteSetProvider();
        await provider.load(data);
        return provider;
    }

    /**
     * Get the sprite set name
     */
    get name(): string {
        return this.spriteSetData?.name || '';
    }

    /**
     * Get the sprite set ID
     */
    get id(): string {
        return this.spriteSetData?.id || '';
    }

    /**
     * Get the tile width
     */
    get tileWidth(): number {
        return this.spriteSetData?.images?.[0]?.spriteWidth || 0;
    }

    /**
     * Get the tile height
     */
    get tileHeight(): number {
        return this.spriteSetData?.images?.[0]?.spriteHeight || 0;
    }

    /**
     * Check if the provider is loaded
     */
    isLoaded(): boolean {
        return this._isLoaded;
    }

    /**
     * Get the loaded sprite set data
     */
    getData(): SpriteSetData {
        return this.spriteSetData;
    }

    /**
     * Connect a signal handler to a sprite set event
     * @param signal The signal name
     * @param callback The callback function
     */
    public connect(signal: string, callback: (...args: any[]) => void): void {
        if (!this.signalHandlers.has(signal)) {
            this.signalHandlers.set(signal, new Set());
        }
        this.signalHandlers.get(signal)?.add(callback);
    }

    /**
     * Disconnect a signal handler from a sprite set event
     * @param signal The signal name
     * @param callback The callback function
     */
    public disconnect(signal: string, callback: (...args: any[]) => void): void {
        this.signalHandlers.get(signal)?.delete(callback);
    }

    /**
     * Emit an event to all connected callbacks
     */
    public emit(signal: string, ...args: any[]): void {
        if (this.signalHandlers.has(signal)) {
            for (const callback of this.signalHandlers.get(signal) || []) {
                callback(...args);
            }
        }
    }

    /**
     * Load sprite set data from a file
     * @param path Path to the sprite set file
     * @returns The loaded sprite set data
     */
    public async loadFromFile(path: string): Promise<SpriteSetData> {
        try {
            this._isLoaded = false;
            this.filePath = path;

            // Load the sprite set file
            const file = Gio.File.new_for_path(path);

            // Use the synchronous method for simplicity
            const [success, contents] = file.load_contents(null);

            if (!success) {
                throw new Error(`Failed to load sprite set file: ${path}`);
            }

            // Convert bytes to string
            const jsonString = new TextDecoder('utf-8').decode(contents);

            // Parse the sprite set data
            const spriteSetData = JSON.parse(jsonString) as SpriteSetData;

            // Validate the sprite set data
            if (!SpriteSetFormat.validate(spriteSetData)) {
                throw new Error('Invalid sprite set data format');
            }

            // Load the sprite set data
            return this.load(spriteSetData);
        } catch (error) {
            console.error('Error loading sprite set from file:', error);
            throw error;
        }
    }

    /**
     * Load sprite set data directly
     * @param data The sprite set data
     * @returns The loaded sprite set data
     */
    public async load(data?: SpriteSetData): Promise<SpriteSetData> {
        try {
            if (data) {
                this.spriteSetData = data;
            }

            if (!this.spriteSetData) {
                throw new Error('No sprite set data provided');
            }

            // Clear existing sprite images
            this.spriteImages.clear();

            // Preload the sprite sheet images
            await this.preloadSpriteSheet();

            this._isLoaded = true;
            this.emit('loaded', this.spriteSetData);
            return this.spriteSetData;
        } catch (error) {
            console.error('Error loading sprite set data:', error);
            this._isLoaded = false;
            throw error;
        }
    }

    /**
     * Preload the sprite sheet image
     */
    private async preloadSpriteSheet(): Promise<void> {
        try {
            // Get the first image source (currently only one is supported)
            const imageSource = this.spriteSetData.images?.[0];
            if (!imageSource) {
                console.warn('No image sources found in sprite set data');
                return;
            }

            // Resolve the image path relative to the sprite set file
            const basePath = pathUtils.extractDirectoryPath(this.filePath);
            const imagePath = pathUtils.joinPaths(basePath, imageSource.path);

            // Load the sprite sheet image
            const pixbuf = await this.loadPixbuf(imagePath);
            if (!pixbuf) {
                throw new Error(`Failed to load sprite sheet image: ${imagePath}`);
            }

            // Process all sprites in the sprite set
            for (const sprite of this.spriteSetData.sprites) {
                // Get the image source for this sprite
                if (!imageSource) continue;

                const spritePixbuf = pixbuf.new_subpixbuf(
                    sprite.col,
                    sprite.row,
                    imageSource.spriteWidth,
                    imageSource.spriteHeight
                );

                // Store the sprite image
                this.spriteImages.set(sprite.id.toString(), spritePixbuf);
            }

            this.emit('sprites-loaded');
        } catch (error) {
            console.error('Error loading sprite sheet:', error);
            throw error;
        }
    }

    /**
     * Load a pixbuf from a file
     * @param path Path to the image file
     * @returns The loaded pixbuf
     */
    private async loadPixbuf(path: string): Promise<GdkPixbuf.Pixbuf | null> {
        try {
            // Use the synchronous method for simplicity
            const pixbuf = GdkPixbuf.Pixbuf.new_from_file(path);
            return pixbuf;
        } catch (error) {
            console.error('Error loading pixbuf:', error);
            return null;
        }
    }

    /**
     * Get a sprite image by ID
     * @param id The sprite ID
     * @returns The sprite image, or null if not found
     */
    public getSpriteImage(id: string): GdkPixbuf.Pixbuf | null {
        return this.spriteImages.get(id) || null;
    }

    /**
     * Create a GTK widget for displaying the sprite set
     * @returns The GTK widget
     */
    public createWidget(): Gtk.Widget {
        // Container for the entire sprite set view
        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
        });

        // Sprite set info section
        const infoBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
        });

        // Sprite set name
        const nameBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
        });
        nameBox.append(new Gtk.Label({
            label: 'Name:',
            xalign: 0,
            width_chars: 10,
        }));
        nameBox.append(new Gtk.Label({
            label: this.spriteSetData.name,
            xalign: 0,
            ellipsize: Pango.EllipsizeMode.END,
            hexpand: true,
        }));
        infoBox.append(nameBox);

        // Sprite set ID
        const idBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
        });
        idBox.append(new Gtk.Label({
            label: 'ID:',
            xalign: 0,
            width_chars: 10,
        }));
        idBox.append(new Gtk.Label({
            label: this.spriteSetData.id,
            xalign: 0,
            ellipsize: Pango.EllipsizeMode.END,
            hexpand: true,
        }));
        infoBox.append(idBox);

        // Add tile size info
        const tileSizeBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 5,
        });
        tileSizeBox.append(new Gtk.Image({
            icon_name: 'view-grid-symbolic',
            pixel_size: 16,
        }));
        tileSizeBox.append(new Gtk.Label({
            label: `${this.spriteSetData.images?.[0]?.spriteWidth || 0} × ${this.spriteSetData.images?.[0]?.spriteHeight || 0}`,
            xalign: 0,
            ellipsize: Pango.EllipsizeMode.END,
            hexpand: true,
        }));
        infoBox.append(tileSizeBox);

        // Sprite count
        const spriteCountBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
        });
        spriteCountBox.append(new Gtk.Label({
            label: 'Sprites:',
            xalign: 0,
            width_chars: 10,
        }));
        spriteCountBox.append(new Gtk.Label({
            label: `${this.spriteSetData.sprites.length}`,
            xalign: 0,
            ellipsize: Pango.EllipsizeMode.END,
            hexpand: true,
        }));
        infoBox.append(spriteCountBox);

        mainBox.append(infoBox);

        // Grid of sprites
        const spriteGrid = new Gtk.FlowBox({
            selection_mode: Gtk.SelectionMode.SINGLE,
            max_children_per_line: 10,
            min_children_per_line: 5,
            homogeneous: true,
            column_spacing: 6,
            row_spacing: 6,
            margin_top: 12,
            vexpand: true,
            hexpand: true,
        });

        // Create grid cells for each sprite
        for (const sprite of this.spriteSetData.sprites) {
            const spriteBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 2,
                margin_start: 3,
                margin_end: 3,
                margin_top: 3,
                margin_bottom: 3,
            });

            // Get the sprite image
            const image = this.getSpriteImage(sprite.id.toString());
            if (image) {
                const imageWidget = new Gtk.Image();
                imageWidget.set_from_pixbuf(image);
                spriteBox.append(imageWidget);
            } else {
                // If image is not available, create a placeholder
                const drawingArea = new Gtk.DrawingArea();
                // Get the image source for this sprite
                const imageSource = this.spriteSetData.images?.[0];
                if (imageSource) {
                    drawingArea.set_content_width(imageSource.spriteWidth);
                    drawingArea.set_content_height(imageSource.spriteHeight);
                } else {
                    drawingArea.set_content_width(32);
                    drawingArea.set_content_height(32);
                }

                drawingArea.set_draw_func((area: any, cr: any, width: number, height: number) => {
                    // Draw a placeholder
                    cr.set_source_rgb(0.8, 0.8, 0.8);
                    cr.rectangle(0, 0, width, height);
                    cr.fill();

                    // Draw a border
                    cr.set_source_rgb(0.5, 0.5, 0.5);
                    cr.set_line_width(1);
                    cr.rectangle(0.5, 0.5, width - 1, height - 1);
                    cr.stroke();

                    // Draw a cross
                    cr.move_to(0, 0);
                    cr.line_to(width, height);
                    cr.move_to(width, 0);
                    cr.line_to(0, height);
                    cr.stroke();
                });

                spriteBox.append(drawingArea);
            }

            // Add sprite ID label
            spriteBox.append(new Gtk.Label({
                label: sprite.id.toString(),
                ellipsize: Pango.EllipsizeMode.END,
                max_width_chars: 15,
                xalign: 0.5,
            }));

            // Add to the grid
            spriteGrid.append(spriteBox);
        }

        // Handle sprite selection
        spriteGrid.connect('child-activated', (flowbox: any, child: any) => {
            const index = child.get_index();
            if (index >= 0 && index < this.spriteSetData.sprites.length) {
                const sprite = this.spriteSetData.sprites[index];
                this.emit('sprite-selected', sprite.id, sprite);
            }
        });

        // Wrap in a scrolled window
        const scrolledWindow = new Gtk.ScrolledWindow({
            vexpand: true,
            hexpand: true,
        });
        scrolledWindow.set_child(spriteGrid);

        mainBox.append(scrolledWindow);

        return mainBox;
    }

    /**
     * Create a GTK widget for tile selection
     * @returns The GTK widget for tile selection
     */
    public createTileSelectionWidget(): Gtk.Widget {
        // Grid to show all tiles
        const tileGrid = new Gtk.FlowBox({
            selection_mode: Gtk.SelectionMode.SINGLE,
            max_children_per_line: 10,
            min_children_per_line: 5,
            homogeneous: true,
            column_spacing: 2,
            row_spacing: 2,
            margin_top: 6,
            vexpand: true,
            hexpand: true,
        });

        // Organize sprites by type
        const tileSpriteIds = this.spriteSetData.sprites
            .filter(s => s.properties?.type === 'tile' || !s.properties?.type)
            .map(s => s.id);

        // Add tile sprites to the grid
        for (const spriteId of tileSpriteIds) {
            const sprite = this.spriteSetData.sprites.find(s => s.id === spriteId);
            if (!sprite) continue;

            // Get the sprite image
            const image = this.getSpriteImage(spriteId.toString());
            if (image) {
                const tileImage = new Gtk.Image();
                tileImage.set_from_pixbuf(image);
                tileGrid.append(tileImage);
            } else {
                // If image is not available, create a placeholder
                const drawingArea = new Gtk.DrawingArea();
                // Get the image source for this sprite
                const imageSource = this.spriteSetData.images?.[0];
                if (imageSource) {
                    drawingArea.set_content_width(imageSource.spriteWidth);
                    drawingArea.set_content_height(imageSource.spriteHeight);
                } else {
                    drawingArea.set_content_width(32);
                    drawingArea.set_content_height(32);
                }

                drawingArea.set_draw_func((area: any, cr: any, width: number, height: number) => {
                    // Draw a placeholder
                    cr.set_source_rgb(0.8, 0.8, 0.8);
                    cr.rectangle(0, 0, width, height);
                    cr.fill();

                    // Draw a border
                    cr.set_source_rgb(0.5, 0.5, 0.5);
                    cr.set_line_width(1);
                    cr.rectangle(0.5, 0.5, width - 1, height - 1);
                    cr.stroke();
                });

                tileGrid.append(drawingArea);
            }
        }

        // Handle tile selection
        tileGrid.connect('child-activated', (flowbox: any, child: any) => {
            const index = child.get_index();
            if (index >= 0 && index < tileSpriteIds.length) {
                const spriteId = tileSpriteIds[index];
                const sprite = this.spriteSetData.sprites.find(s => s.id === spriteId);
                if (sprite) {
                    this.emit('tile-selected', spriteId, sprite);
                }
            }
        });

        // Wrap in a scrolled window
        const scrolledWindow = new Gtk.ScrolledWindow({
            vexpand: true,
            hexpand: true,
        });
        scrolledWindow.set_child(tileGrid);

        return scrolledWindow;
    }

    /**
     * Save the sprite set data to a file
     * @param path Optional path to save to (defaults to the original path)
     */
    public async saveToFile(path?: string): Promise<boolean> {
        const savePath = path || this.filePath;
        if (!savePath) {
            throw new Error('No file path specified for saving sprite set');
        }

        try {
            const jsonString = JSON.stringify(this.spriteSetData, null, 2);
            const file = Gio.File.new_for_path(savePath);

            // Use the synchronous method for simplicity
            const bytes = GLib.Bytes.new(new TextEncoder().encode(jsonString));
            const [success] = file.replace_contents(
                bytes.get_data() as Uint8Array,
                null,
                false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null
            );

            if (success) {
                this.emit('saved', savePath);
            }

            return success;
        } catch (error) {
            console.error('Error saving sprite set data:', error);
            return false;
        }
    }
}

