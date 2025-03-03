import Gio from '@girs/gio-2.0';
import Gtk from '@girs/gtk-4.0';
import GLib from '@girs/glib-2.0';
import Pango from '@girs/pango-1.0';
import GObject from '@girs/gobject-2.0';
import Cairo from 'cairo';
import {
    MapData,
    MapFormat,
    ResourceProvider,
    ResourceEventEmitter,
    MapResourceOptions
} from '@pixelrpg/data-core';
import { pathUtils, fileUtils } from '../utils';

/**
 * GJS Provider for Map data
 * Loads and manages map data for GTK applications
 */
export class MapProvider implements ResourceProvider<MapData>, ResourceEventEmitter {
    /**
     * The loaded map data
     */
    private mapData!: MapData;

    /**
     * Flag to indicate if the resource is loaded
     */
    private _isLoaded: boolean = false;

    /**
     * Signal handlers for map events
     */
    private signalHandlers: Map<string, Set<(...args: any[]) => void>> = new Map();

    /**
     * Path to the map file
     */
    private filePath: string = '';

    /**
     * Static factory method to create a MapProvider from a file
     * @param path Path to the map file
     * @param options Options for the map provider
     * @returns Promise resolving to a MapProvider
     */
    static async fromFile(path: string, options?: MapResourceOptions): Promise<MapProvider> {
        const provider = new MapProvider();
        await provider.loadFromFile(path);
        return provider;
    }

    /**
     * Static factory method to create a MapProvider from data
     * @param data The map data
     * @param options Options for the map provider
     * @returns Promise resolving to a MapProvider
     */
    static async fromData(data: MapData, options?: MapResourceOptions): Promise<MapProvider> {
        const provider = new MapProvider();
        provider.mapData = data;
        provider._isLoaded = true;
        return provider;
    }

    /**
     * Get the name of the map
     */
    get name(): string {
        return this.mapData?.name || '';
    }

    /**
     * Get the ID of the map (computed from filename if not present)
     */
    get id(): string {
        // Use the explicit ID if available
        if (this.mapData?.id) {
            return this.mapData.id;
        }

        // Otherwise compute from the filename if available
        if (this.filePath) {
            return this.filePath.split('/').pop()?.replace(/\.json$/, '') || '';
        }

        return '';
    }

    /**
     * Get the width of the map in tiles
     */
    get columns(): number {
        return this.mapData?.columns || 0;
    }

    /**
     * Get the height of the map in tiles
     */
    get rows(): number {
        return this.mapData?.rows || 0;
    }

    /**
     * Whether the resource is loaded
     */
    isLoaded(): boolean {
        return this._isLoaded;
    }

    /**
     * Get the resource data
     */
    getData(): MapData {
        return this.mapData;
    }

    /**
     * Connect a callback to an event
     */
    public connect(signal: string, callback: (...args: any[]) => void): void {
        if (!this.signalHandlers.has(signal)) {
            this.signalHandlers.set(signal, new Set());
        }
        this.signalHandlers.get(signal)?.add(callback);
    }

    /**
     * Disconnect a callback from an event
     */
    public disconnect(signal: string, callback: (...args: any[]) => void): void {
        if (this.signalHandlers.has(signal)) {
            this.signalHandlers.get(signal)?.delete(callback);
        }
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
     * Load a map from a file
     * @param path Path to the map file
     * @returns Promise resolving to the map data
     */
    public async loadFromFile(path: string): Promise<MapData> {
        this.filePath = path;
        return this.load();
    }

    /**
     * Load the map data
     */
    async load(): Promise<MapData> {
        try {
            if (this._isLoaded) {
                return this.mapData;
            }

            if (!this.filePath) {
                throw new Error('No file path specified for map');
            }

            // Load the map data from the file using the utility function
            const mapData = await fileUtils.loadJsonFile<MapData>(this.filePath);

            // Validate the map data
            if (!MapFormat.validate(mapData)) {
                throw new Error('Invalid map data format');
            }

            this.mapData = mapData;
            this._isLoaded = true;
            this.emit('loaded', this);

            return this.mapData;
        } catch (error) {
            console.error('Error loading map:', error);
            throw error;
        }
    }

    /**
     * Create a GTK widget for displaying the map properties
     * @returns The GTK widget
     */
    public createPropertiesWidget(): Gtk.Widget {
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            margin_start: 12,
            margin_end: 12,
            margin_top: 12,
            margin_bottom: 12,
        });

        // Map name
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
            label: this.mapData.name,
            xalign: 0,
            ellipsize: Pango.EllipsizeMode.END,
            hexpand: true,
        }));
        box.append(nameBox);

        // Map ID
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
            label: this.mapData.id,
            xalign: 0,
            ellipsize: Pango.EllipsizeMode.END,
            hexpand: true,
        }));
        box.append(idBox);

        // Map dimensions
        const dimensionsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
        });
        dimensionsBox.append(new Gtk.Label({
            label: 'Size:',
            xalign: 0,
            width_chars: 10,
        }));
        dimensionsBox.append(new Gtk.Label({
            label: `${this.mapData.columns} × ${this.mapData.rows}`,
            xalign: 0,
            ellipsize: Pango.EllipsizeMode.END,
            hexpand: true,
        }));
        box.append(dimensionsBox);

        // Map tileSize
        const tileSizeBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
        });
        tileSizeBox.append(new Gtk.Label({
            label: 'Tile Size:',
            xalign: 0,
            width_chars: 10,
        }));
        tileSizeBox.append(new Gtk.Label({
            label: `${this.mapData.tileWidth} × ${this.mapData.tileHeight}`,
            xalign: 0,
            ellipsize: Pango.EllipsizeMode.END,
            hexpand: true,
        }));
        box.append(tileSizeBox);

        // Layer count
        const layerCountBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
        });
        layerCountBox.append(new Gtk.Label({
            label: 'Layers:',
            xalign: 0,
            width_chars: 10,
        }));
        layerCountBox.append(new Gtk.Label({
            label: `${this.mapData.layers.length}`,
            xalign: 0,
            ellipsize: Pango.EllipsizeMode.END,
            hexpand: true,
        }));
        box.append(layerCountBox);

        return box;
    }

    /**
     * Create a GTK widget for displaying the layer list
     * @returns The GTK widget
     */
    public createLayersWidget(): Gtk.Widget {
        // Create list store for layers
        const store = new Gtk.ListStore();
        store.set_column_types([
            GObject.TYPE_STRING, // Name
            GObject.TYPE_BOOLEAN, // Visible
            GObject.TYPE_INT, // Index
            GObject.TYPE_STRING, // Type
        ]);

        // Populate store with layers
        for (let i = 0; i < this.mapData.layers.length; i++) {
            const layer = this.mapData.layers[i];
            const iter = store.append();
            store.set(iter, [0, 1, 2, 3], [
                layer.name,
                layer.visible !== false, // default to true if not specified
                i,
                layer.type,
            ]);
        }

        // Create tree view for the layers
        const treeView = new Gtk.TreeView({
            model: store,
            vexpand: true,
            hexpand: true,
        });

        // Add visible toggle column
        const toggleRenderer = new Gtk.CellRendererToggle();
        toggleRenderer.connect('toggled', (renderer, path) => {
            const [, iter] = store.get_iter_from_string(path);
            const currentValue = (store.get_value(iter, 1) as GObject.Value).get_boolean();
            store.set_value(iter, 1, !currentValue);

            // Update layer visibility in the data model
            const index = (store.get_value(iter, 2) as GObject.Value).get_int();
            if (index >= 0 && index < this.mapData.layers.length) {
                this.mapData.layers[index].visible = !currentValue;
                this.emit('layer-visibility-changed', index, !currentValue);
            }
        });

        const visibleColumn = new Gtk.TreeViewColumn({
            title: 'Visible',
            resizable: false,
            clickable: true,
        });
        visibleColumn.pack_start(toggleRenderer, false);
        visibleColumn.add_attribute(toggleRenderer, 'active', 1);
        treeView.append_column(visibleColumn);

        // Add name column
        const textRenderer = new Gtk.CellRendererText({
            editable: true,
        });
        textRenderer.connect('edited', (renderer, path, newText) => {
            const [, iter] = store.get_iter_from_string(path);
            store.set_value(iter, 0, newText);

            // Update layer name in the data model
            const index = (store.get_value(iter, 2) as GObject.Value).get_int();
            if (index >= 0 && index < this.mapData.layers.length) {
                this.mapData.layers[index].name = newText;
                this.emit('layer-renamed', index, newText);
            }
        });

        const nameColumn = new Gtk.TreeViewColumn({
            title: 'Layer',
            resizable: true,
            expand: true,
        });
        nameColumn.pack_start(textRenderer, true);
        nameColumn.add_attribute(textRenderer, 'text', 0);
        treeView.append_column(nameColumn);

        // Add type column
        const typeRenderer = new Gtk.CellRendererText();
        const typeColumn = new Gtk.TreeViewColumn({
            title: 'Type',
            resizable: false,
        });
        typeColumn.pack_start(typeRenderer, true);
        typeColumn.add_attribute(typeRenderer, 'text', 3);
        treeView.append_column(typeColumn);

        // Wrap in a scrolled window
        const scrolledWindow = new Gtk.ScrolledWindow({
            vexpand: true,
            hexpand: true,
        });
        scrolledWindow.set_child(treeView);

        return scrolledWindow;
    }

    /**
     * Create a GTK widget for displaying a mini-map preview
     * @returns The GTK widget
     */
    public createMiniMapWidget(): Gtk.Widget {
        const drawingArea = new Gtk.DrawingArea();

        // Calculate the preview size based on the map dimensions
        const maxSize = 300;
        const aspectRatio = this.mapData.columns / this.mapData.rows;
        let previewWidth, previewHeight;

        if (aspectRatio > 1) {
            previewWidth = maxSize;
            previewHeight = maxSize / aspectRatio;
        } else {
            previewHeight = maxSize;
            previewWidth = maxSize * aspectRatio;
        }

        drawingArea.set_content_width(previewWidth);
        drawingArea.set_content_height(previewHeight);

        // Set drawing function
        drawingArea.set_draw_func((area, _cr, width, height) => {
            const cr = _cr as Cairo.Context;
            // Clear background
            cr.setSourceRGB(0.9, 0.9, 0.9);
            cr.paint();

            // Draw grid
            cr.setSourceRGB(0.8, 0.8, 0.8);
            cr.setLineWidth(0.5);

            const cellWidth = width / this.mapData.columns;
            const cellHeight = height / this.mapData.rows;

            // Draw vertical grid lines
            for (let i = 1; i < this.mapData.columns; i++) {
                const x = i * cellWidth;
                cr.moveTo(x, 0);
                cr.lineTo(x, height);
            }

            // Draw horizontal grid lines
            for (let i = 1; i < this.mapData.rows; i++) {
                const y = i * cellHeight;
                cr.moveTo(0, y);
                cr.lineTo(width, y);
            }

            cr.stroke();

            // TODO: Render a simplified version of the map
            // This would need access to the actual tile graphics
            // For now, just indicate where objects are located

            // Draw a border
            cr.setSourceRGB(0.3, 0.3, 0.3);
            cr.setLineWidth(2);
            cr.rectangle(0, 0, width, height);
            cr.stroke();
        });

        return drawingArea;
    }

    /**
     * Save the map data to a file
     * @param path Optional path to save to (defaults to the original path)
     */
    public async saveToFile(path?: string): Promise<boolean> {
        const savePath = path || this.filePath;
        if (!savePath) {
            throw new Error('No file path specified for saving map');
        }

        try {
            const result = await fileUtils.saveJsonFile(savePath, this.mapData);

            if (result.success) {
                this.emit('saved', savePath);
            }

            return result.success;
        } catch (error) {
            console.error('Error saving map data:', error);
            return false;
        }
    }
} 