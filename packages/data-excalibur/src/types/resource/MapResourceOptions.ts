import { ResourceOptions } from '@pixelrpg/data-core';

export interface MapResourceOptions extends ResourceOptions {
    /**
     * Plugin will operate in headless mode and skip all graphics related
     * excalibur items including creating ImageSource's
     * Default false.
     */
    headless?: boolean;
}