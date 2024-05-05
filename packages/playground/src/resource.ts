import Gio from '@girs/gio-2.0';

import { ROOT_DIR } from "./constants";

// const resource = Gio.Resource.load('/path/to/org.pixelrpg.map-editor.data.gresource');
// Gio.resources_register(resource);

// const cssFile = Gio.resources_lookup_data('/org/pixelrpg/map-editor/path/to/your/style.css', Gio.ResourceLookupFlags.NONE);
// const cssData = cssFile.toArray().toString();


class Resource {

    client: Gio.Resource;
    clientPath = '/org/pixelrpg/map-editor/client';

    constructor() {
        const path = ROOT_DIR.resolve_relative_path('./org.pixelrpg.map-editor.data.gresource').get_path()!;
        console.log("Resource path:", path);
        this.client = Gio.Resource.load(path);
        this.register(this.client);
    }

    register(resource: Gio.Resource) {
        Gio.resources_register(resource)
    }
    
    get(path: string) {
        console.log("get", path);
        if(!path.startsWith(this.clientPath)) {
            path = this.clientPath + path;
        }
        return Gio.resources_lookup_data(path, Gio.ResourceLookupFlags.NONE);
    }

    stream(path: string) {
        console.log("open stream", path);
        if(!path.startsWith(this.clientPath)) {
            path = this.clientPath + path;
        }
        return Gio.resources_open_stream(path, Gio.ResourceLookupFlags.NONE);
    }
}

export const resource = new Resource();
