import Gio from '@girs/gio-2.0';

export const ROOT_DIR = Gio.File.new_for_uri(
    import.meta.url,
  ).resolve_relative_path("../..");


export const CLIENT_DIR = ROOT_DIR.resolve_relative_path("./client");

