// Blueprint template imports — compiled to XML strings by
// `@gjsify/esbuild-plugin-blueprint` (wired in via `gjsify build`).
declare module '*.blp' {
  const content: string
  export default content
}

declare module '*.css' {
  const content: string
  export default content
}
