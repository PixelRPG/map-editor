import { ImageSource, Loadable } from 'excalibur';
import { TileSetData } from '@pixelrpg/map-format-core';
import { ExcaliburTileSetFormat } from '../format/ExcaliburTileSetFormat';
import { TileSetResourceOptions } from '../types/TileSetResourceOptions';

/**
 * Resource class for loading custom TileSet format into Excalibur
 */
export class TileSetResource implements Loadable<ExcaliburTileSetFormat> {
    data!: ExcaliburTileSetFormat;
    private readonly headless: boolean = false;
    private imageLoader: ImageSource;
    private tileSetData: TileSetData;

    constructor(tileSetData: TileSetData, options?: TileSetResourceOptions) {
        this.headless = options?.headless ?? this.headless;
        this.tileSetData = tileSetData;

        if (!this.headless) {
            this.imageLoader = new ImageSource(tileSetData.image);
        }
    }

    async load(): Promise<ExcaliburTileSetFormat> {
        try {
            // In headless mode, we skip loading the actual image
            if (!this.headless) {
                await this.imageLoader.load();
            }

            // Convert the tileset data to Excalibur format
            const result = ExcaliburTileSetFormat.toExcalibur(this.tileSetData);

            // Store the result
            this.data = new ExcaliburTileSetFormat();
            Object.assign(this.data, result);

            return this.data;
        } catch (e) {
            console.error(`Could not load tileset: ${e}`);
            throw e;
        }
    }

    isLoaded(): boolean {
        return !!this.data;
    }
} 