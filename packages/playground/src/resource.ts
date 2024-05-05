import Gio from '@girs/gio-2.0';
import GLib from '@girs/glib-2.0';

import { ROOT_DIR, CLIENT_DIR } from "./constants";

// const resource = Gio.Resource.load('/path/to/org.pixelrpg.map-editor.data.gresource');
// Gio.resources_register(resource);

// const cssFile = Gio.resources_lookup_data('/org/pixelrpg/map-editor/path/to/your/style.css', Gio.ResourceLookupFlags.NONE);
// const cssData = cssFile.toArray().toString();

Gio._promisify(Gio.File.prototype, "load_contents_async", "load_contents_finish");


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
            console.log("path not starting with clientPath", path, this.clientPath);
            path = this.clientPath + path;
        }
        return Gio.resources_lookup_data(path, Gio.ResourceLookupFlags.NONE);
    }

    getDirect(path: string) {
        if(!path.startsWith(CLIENT_DIR.get_path()!)) {
            path = CLIENT_DIR.get_path()! + "/" + path;
        }
        console.log("get direct", path);
        return Gio.File.new_for_path(path).load_contents(null)[1];
    }

    stream(path: string) {
        console.log("open stream", path);
        if(!path.startsWith(this.clientPath)) {
            console.log("path not starting with clientPath", path, this.clientPath);
            path = this.clientPath + path;
        }
        return Gio.resources_open_stream(path, Gio.ResourceLookupFlags.NONE);
    }

    streamDirect(path: string) {
        if(!path.startsWith(CLIENT_DIR.get_path()!)) {
            path = CLIENT_DIR.get_path()! + "/" + path;
        }
        console.log("open stream direct", path);
        return Gio.File.new_for_path(path).read(null);
    }
}

export const resource = new Resource();
