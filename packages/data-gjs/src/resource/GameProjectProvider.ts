import Gio from '@girs/gio-2.0';
import Gtk from '@girs/gtk-4.0';
import GObject from '@girs/gobject-2.0';
import Pango from '@girs/pango-1.0';
import GLib from '@girs/glib-2.0';
import { GameProjectData, GameProjectFormat, ResourceProvider, ResourceEventEmitter, GameProjectResourceOptions } from '@pixelrpg/data-core';
import { GameProjectProviderOptions } from '../types/GameProjectProviderOptions';
import { MapProvider } from './MapProvider';
import { SpriteSetProvider } from './SpriteSetProvider';
import { pathUtils } from '../utils/index';

/**
 * GJS Provider for GameProject data
 * Loads and manages a game project for GTK applications
 */
export class GameProjectProvider implements ResourceProvider<GameProjectData>, ResourceEventEmitter {
    /**
     * The loaded game project data
     */
    private gameProjectData!: GameProjectData;

    /**
     * Configuration options
     */
    private readonly preloadAllMaps: boolean = false;
    private readonly preloadAllSpriteSets: boolean = true;
    private readonly customInitialMapId?: string;

    /**
     * Store of all maps and sprite sets
     */
    private mapProviders: Map<string, MapProvider> = new Map();
    private spriteSetProviders: Map<string, SpriteSetProvider> = new Map();

    /**
     * Flag to indicate if the resource is loaded
     */
    private _isLoaded: boolean = false;

    /**
     * Active map ID - the currently selected map
     */
    private _activeMapId: string = '';

    /**
     * Signal handlers for project events
     */
    private signalHandlers: Map<string, Set<(...args: any[]) => void>> = new Map();

    /**
     * Project tree store for GTK widgets
     */
    private treeStore: Gtk.TreeStore | null = null;

    /**
     * Constructor for GameProjectProvider
     * @param options Configuration options
     */
    constructor(options?: GameProjectProviderOptions) {
        this.preloadAllMaps = options?.preloadAllMaps ?? false;
        this.preloadAllSpriteSets = options?.preloadAllSpriteSets ?? true;
        this.customInitialMapId = options?.initialMapId;
    }

    /**
     * Get the project name
     */
    get name(): string {
        return this.gameProjectData?.name || '';
    }

    /**
     * Get the project ID
     */
    get id(): string {
        return this.gameProjectData?.id || '';
    }

    /**
     * Check if the provider is loaded
     */
    isLoaded(): boolean {
        return this._isLoaded;
    }

    /**
     * Get the loaded project data
     */
    getData(): GameProjectData {
        return this.gameProjectData;
    }

    /**
     * Get a map provider by ID
     * @param id The map ID
     * @returns The map provider, or undefined if not found
     */
    public getMap(id: string): MapProvider | undefined {
        return this.mapProviders.get(id);
    }

    /**
     * Get a sprite set provider by ID
     * @param id The sprite set ID
     * @returns The sprite set provider, or undefined if not found
     */
    public getSpriteSet(id: string): SpriteSetProvider | undefined {
        return this.spriteSetProviders.get(id);
    }

    /**
     * Get all map providers
     */
    public get maps(): Map<string, MapProvider> {
        return this.mapProviders;
    }

    /**
     * Get all sprite set providers
     */
    public get spriteSets(): Map<string, SpriteSetProvider> {
        return this.spriteSetProviders;
    }

    /**
     * Connect a signal handler to a project event
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
     * Disconnect a signal handler from a project event
     * @param signal The signal name
     * @param callback The callback function
     */
    public disconnect(signal: string, callback: (...args: any[]) => void): void {
        this.signalHandlers.get(signal)?.delete(callback);
    }

    /**
     * Emit a signal
     * @param signal The signal name
     * @param args The signal arguments
     */
    public emit(signal: string, ...args: any[]): void {
        const handlers = this.signalHandlers.get(signal);
        if (handlers) {
            for (const handler of handlers) {
                GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                    handler(...args);
                    return GLib.SOURCE_REMOVE;
                });
            }
        }
    }

    /**
     * Load a game project from a file
     * @param path Path to the project file
     */
    public async loadFromFile(path: string): Promise<GameProjectData> {
        try {
            // Reset state
            this._isLoaded = false;
            this.mapProviders.clear();
            this.spriteSetProviders.clear();

            // Load the project file
            const file = Gio.File.new_for_path(path);
            const [success, contents] = await new Promise<[boolean, string]>((resolve) => {
                file.load_contents_async(null, (obj, res) => {
                    try {
                        const [success, contents] = file.load_contents_finish(res);
                        if (success) {
                            const decoder = new TextDecoder('utf-8');
                            resolve([true, decoder.decode(contents)]);
                        } else {
                            resolve([false, '']);
                        }
                    } catch (error) {
                        console.error('Error loading project file:', error);
                        resolve([false, '']);
                    }
                });
            });

            if (!success) {
                throw new Error(`Failed to load project file: ${path}`);
            }

            // Parse the project data
            const projectData = JSON.parse(contents) as GameProjectData;

            // Validate the project data
            if (!GameProjectFormat.validate(projectData)) {
                throw new Error('Invalid project data format');
            }

            this.gameProjectData = projectData;

            // Get the base directory for resolving relative paths
            const basePath = pathUtils.extractDirectoryPath(path);

            // Load sprite sets if configured to do so
            if (this.preloadAllSpriteSets) {
                await this.loadAllSpriteSets(basePath);
            }

            // Load maps if configured to do so
            if (this.preloadAllMaps) {
                await this.loadAllMaps(basePath);
            }

            // Set the initial active map
            const initialMapId = this.customInitialMapId || this.gameProjectData.startup.initialMapId;
            if (initialMapId) {
                await this.loadMap(initialMapId, basePath);
                this._activeMapId = initialMapId;
            }

            this._isLoaded = true;
            this.emit('loaded', this.gameProjectData);
            return this.gameProjectData;
        } catch (error) {
            console.error('Error loading game project:', error);
            throw error;
        }
    }

    /**
     * Load the project data directly
     * @param data The game project data
     */
    public async load(data?: GameProjectData): Promise<GameProjectData> {
        if (data) {
            this.gameProjectData = data;
        }

        if (!this.gameProjectData) {
            throw new Error('No game project data provided');
        }

        // Set the initial active map
        const initialMapId = this.customInitialMapId || this.gameProjectData.startup.initialMapId;
        if (initialMapId) {
            this._activeMapId = initialMapId;
        }

        this._isLoaded = true;
        this.emit('loaded', this.gameProjectData);
        return this.gameProjectData;
    }

    /**
     * Load all sprite sets in the project
     * @param basePath The base path for resolving relative paths
     */
    private async loadAllSpriteSets(basePath: string): Promise<void> {
        const loadPromises = this.gameProjectData.spriteSets.map(
            (spriteSetRef) => this.loadSpriteSet(spriteSetRef.id, basePath)
        );
        await Promise.all(loadPromises);
    }

    /**
     * Load all maps in the project
     * @param basePath The base path for resolving relative paths
     */
    private async loadAllMaps(basePath: string): Promise<void> {
        const loadPromises = this.gameProjectData.maps.map(
            (mapRef) => this.loadMap(mapRef.id, basePath)
        );
        await Promise.all(loadPromises);
    }

    /**
     * Load a single sprite set
     * @param id The sprite set ID
     * @param basePath The base path for resolving relative paths
     * @returns The loaded sprite set provider
     */
    private async loadSpriteSet(id: string, basePath: string): Promise<SpriteSetProvider> {
        // Check if already loaded
        if (this.spriteSetProviders.has(id)) {
            return this.spriteSetProviders.get(id)!;
        }

        // Find the sprite set reference
        const spriteSetRef = this.gameProjectData.spriteSets.find(
            (ref) => ref.id === id
        );

        if (!spriteSetRef) {
            throw new Error(`Sprite set not found: ${id}`);
        }

        // Create the provider
        const provider = new SpriteSetProvider();

        // Load the sprite set data
        const fullPath = pathUtils.joinPaths(basePath, spriteSetRef.path);
        await provider.loadFromFile(fullPath);

        // Store the provider
        this.spriteSetProviders.set(id, provider);

        return provider;
    }

    /**
     * Load a single map
     * @param id The map ID
     * @param basePath The base path for resolving relative paths
     * @returns The loaded map provider
     */
    private async loadMap(id: string, basePath: string): Promise<MapProvider> {
        // Check if already loaded
        if (this.mapProviders.has(id)) {
            return this.mapProviders.get(id)!;
        }

        // Find the map reference
        const mapRef = this.gameProjectData.maps.find(
            (ref) => ref.id === id
        );

        if (!mapRef) {
            throw new Error(`Map not found: ${id}`);
        }

        const fullPath = pathUtils.joinPaths(basePath, mapRef.path);

        // Create the provider
        const provider = new MapProvider();

        // Load the map data

        await provider.loadFromFile(fullPath);

        // Store the provider
        this.mapProviders.set(id, provider);

        return provider;
    }

    /**
     * Create a tree view for the project structure
     * @returns The GTK tree view widget
     */
    public createTreeView(): Gtk.TreeView {
        // Create the tree store if it doesn't exist
        if (!this.treeStore) {
            this.treeStore = new Gtk.TreeStore();
            this.treeStore.set_column_types([
                GObject.TYPE_STRING, // Name
                GObject.TYPE_STRING, // ID
                GObject.TYPE_STRING, // Type (map, category, spriteSet)
                GObject.TYPE_STRING, // Icon name
            ]);

            // Populate the tree store
            this.populateTreeStore();
        }

        // Create the tree view
        const treeView = new Gtk.TreeView({
            model: this.treeStore,
            headers_visible: false,
        });

        // Create a column for the name with an icon
        const column = new Gtk.TreeViewColumn({ title: 'Item' });

        // Icon renderer
        const iconRenderer = new Gtk.CellRendererPixbuf();
        column.pack_start(iconRenderer, false);
        column.add_attribute(iconRenderer, 'icon_name', 3);

        // Text renderer
        const textRenderer = new Gtk.CellRendererText();
        column.pack_start(textRenderer, true);
        column.add_attribute(textRenderer, 'text', 0);

        treeView.append_column(column);

        // Connect to selection changes
        const selection = treeView.get_selection();
        selection.connect('changed', () => {
            const [success, model, iter] = selection.get_selected();
            if (success && model !== null && iter !== null) {
                const id = (model.get_value(iter, 1) as string)[0];
                const type = (model.get_value(iter, 2) as string)[0];

                if (type === 'map') {
                    this._activeMapId = id;
                    this.emit('map-selected', id);
                } else if (type === 'spriteSet') {
                    this.emit('sprite-set-selected', id);
                }
            }
        });

        return treeView;
    }

    /**
     * Populate the tree store with project structure
     */
    private populateTreeStore(): void {
        if (!this.treeStore || !this.gameProjectData) {
            return;
        }

        // Clear the store
        this.treeStore.clear();

        // Add maps section
        const mapsIter = this.treeStore.append(null);
        this.treeStore.set(mapsIter, [
            0, 1, 2, 3
        ], [
            'Maps', '', 'section', 'folder'
        ]);

        // Group maps by category
        const mapsByCategory: Map<string, any[]> = new Map();
        mapsByCategory.set('', []); // Default category

        // Initialize categories
        if (this.gameProjectData.mapCategories) {
            for (const category of this.gameProjectData.mapCategories) {
                mapsByCategory.set(category.id, []);
            }
        }

        // Sort maps into categories
        for (const map of this.gameProjectData.maps) {
            const categoryId = map.category || '';
            if (!mapsByCategory.has(categoryId)) {
                mapsByCategory.set(categoryId, []);
            }
            mapsByCategory.get(categoryId)?.push(map);
        }

        // Add maps by category
        for (const [categoryId, maps] of mapsByCategory.entries()) {
            if (maps.length === 0) {
                continue;
            }

            let categoryIter: any = null;

            // Add category if it exists
            if (categoryId !== '') {
                const category = this.gameProjectData.mapCategories?.find(
                    (c) => c.id === categoryId
                );

                if (category) {
                    categoryIter = this.treeStore.append(mapsIter);
                    this.treeStore.set(categoryIter, [
                        0, 1, 2, 3
                    ], [
                        category.name, category.id, 'category', 'folder-symbolic'
                    ]);
                }
            } else {
                categoryIter = mapsIter;
            }

            // Add maps in this category
            for (const map of maps) {
                const mapIter = this.treeStore.append(categoryIter);
                this.treeStore.set(mapIter, [
                    0, 1, 2, 3
                ], [
                    map.name, map.id, 'map', 'map-symbolic'
                ]);
            }
        }

        // Add sprite sets section
        const spriteSetsIter = this.treeStore.append(null);
        this.treeStore.set(spriteSetsIter, [
            0, 1, 2, 3
        ], [
            'Sprite Sets', '', 'section', 'folder'
        ]);

        // Add sprite sets
        for (const spriteSet of this.gameProjectData.spriteSets) {
            const spriteSetIter = this.treeStore.append(spriteSetsIter);
            this.treeStore.set(spriteSetIter, [
                0, 1, 2, 3
            ], [
                spriteSet.name, spriteSet.id, 'spriteSet', 'applications-games-symbolic'
            ]);
        }
    }

    /**
     * Create a widget to display a sprite set
     * @param id The sprite set ID
     * @returns The widget, or null if the sprite set is not found
     */
    public createSpriteSetWidget(id: string): Gtk.Widget | null {
        const provider = this.spriteSetProviders.get(id);
        if (!provider) {
            return null;
        }

        return provider.createWidget();
    }

    /**
     * Create a widget to display project information
     * @returns The project info widget
     */
    public createInfoWidget(): Gtk.Widget {
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            margin_start: 12,
            margin_end: 12,
            margin_top: 12,
            margin_bottom: 12,
        });

        // Project name
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
            label: this.gameProjectData.name,
            xalign: 0,
            ellipsize: Pango.EllipsizeMode.END,
            hexpand: true,
        }));
        box.append(nameBox);

        // Project ID
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
            label: this.gameProjectData.id,
            xalign: 0,
            ellipsize: Pango.EllipsizeMode.END,
            hexpand: true,
        }));
        box.append(idBox);

        // Project version
        const versionBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
        });
        versionBox.append(new Gtk.Label({
            label: 'Version:',
            xalign: 0,
            width_chars: 10,
        }));
        versionBox.append(new Gtk.Label({
            label: this.gameProjectData.version,
            xalign: 0,
            ellipsize: Pango.EllipsizeMode.END,
            hexpand: true,
        }));
        box.append(versionBox);

        // Summary stats
        const statsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            margin_top: 12,
        });
        statsBox.append(new Gtk.Label({
            label: `Maps: ${this.gameProjectData.maps.length}`,
            xalign: 0,
            width_chars: 10,
        }));
        statsBox.append(new Gtk.Label({
            label: `Sprite Sets: ${this.gameProjectData.spriteSets.length}`,
            xalign: 0,
            ellipsize: Pango.EllipsizeMode.END,
            hexpand: true,
        }));
        box.append(statsBox);

        return box;
    }

    /**
     * Static factory method to create a GameProjectProvider from a file
     * @param path Path to the game project file
     * @param options Options for the game project provider
     * @returns Promise resolving to a GameProjectProvider
     */
    static async fromFile(path: string, options?: GameProjectResourceOptions): Promise<GameProjectProvider> {
        const provider = new GameProjectProvider(options);
        await provider.loadFromFile(path);
        return provider;
    }

    /**
     * Static factory method to create a GameProjectProvider from data
     * @param data The game project data
     * @param options Options for the game project provider
     * @returns Promise resolving to a GameProjectProvider
     */
    static async fromData(data: GameProjectData, options?: GameProjectResourceOptions): Promise<GameProjectProvider> {
        const provider = new GameProjectProvider(options);
        await provider.load(data);
        return provider;
    }
} 