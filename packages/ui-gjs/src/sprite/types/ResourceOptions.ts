import { ResourceOptions as CoreResourceOptions } from '@pixelrpg/data';

export interface ResourceOptions extends CoreResourceOptions {
    /**
     * Whether to use GResource for loading assets
     */
    useGResource?: boolean;

    /**
     * Optional GResource path prefix
     */
    resourcePrefix?: string;
}
