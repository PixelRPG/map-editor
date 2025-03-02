export const normalizeUrl = (path: string, basePath = window.location.origin) => {
    return new URL(path, basePath).href;
}
