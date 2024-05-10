/**
 * Type definition for asset content files
 * @see https://vitejs.dev/guide/assets.html#importing-asset-as-string
 */
declare module '*?raw' {
  const textContent: string
  export default textContent
}

/**
 * Type definition for url asset strings
 * @see https://vitejs.dev/guide/assets.html#explicit-url-imports
 */
declare module '*?url' {
  const url: string
  export default url
}
