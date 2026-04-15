/// <reference types="vite/client" />

declare const __APPLICATION_ID__: string
declare const __RESOURCES_PATH__: string
declare const __PACKAGE_VERSION__: string
declare const __PREFIX__: string
declare const __LIBDIR__: string
declare const __DATADIR__: string
declare const __BINDIR__: string
declare const __GJS_CONSOLE__: string
declare const __PKGDATADIR__: string

// Blueprint template imports
declare module '*.blp' {
  const content: string
  export default content
}

// For CSS imports
declare module '*.css' {
  const content: string
  export default content
}

declare module '*.json' {
  const content: any
  export default content
}
