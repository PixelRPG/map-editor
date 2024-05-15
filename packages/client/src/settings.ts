export const settings = {
    /** Whether the app is running in a webview */
    isApp: window.webkit !== undefined,
    /** Whether the app is running in a browser */
    isBrowser: window.webkit === undefined,
}

