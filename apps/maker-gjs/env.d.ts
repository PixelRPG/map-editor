declare const __APPLICATION_ID__: string
declare const __RESOURCES_PATH__: string
declare const __PACKAGE_VERSION__: string
declare const __PREFIX__: string
declare const __LIBDIR__: string
declare const __DATADIR__: string
declare const __BINDIR__: string
declare const __GJS_CONSOLE__: string
declare const __PKGDATADIR__: string

declare module '*.blp' {
  const content: string
  export default content
}

declare module '*.css' {
  const content: string
  export default content
}

declare module '*?raw' {
  const content: string
  export default content
}

declare module '*?url' {
  const url: string
  export default url
}
