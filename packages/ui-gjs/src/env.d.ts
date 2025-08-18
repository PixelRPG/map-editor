/// <reference types="vite/client" />

// Blueprint template imports
declare module '*.blp' {
  const content: string;
  export default content;
}

// For CSS imports
declare module '*.css' {
  const content: string;
  export default content;
}
