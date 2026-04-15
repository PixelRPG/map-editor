import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'

export const resolve = (
  dir: string | Gio.File,
  ...filenames: string[]
): Gio.File => {
  let file = typeof dir === 'string' ? Gio.File.new_for_path(dir) : dir
  for (const filename of filenames) {
    file = file.resolve_relative_path(filename)
  }
  return file
}

/**
 * Resolves a resource path relative to a base directory with robust error handling
 * @param basePath The base directory path
 * @param relativePath The relative path to resolve
 * @param debugPrefix Optional prefix for debug messages
 * @returns The resolved absolute path
 */
export const resolveResourcePath = (
  basePath: string,
  relativePath: string,
  debugPrefix = '[PathResolver]',
): string => {
  // Handle absolute paths and URLs directly
  if (relativePath.startsWith('/')) {
    console.debug(`${debugPrefix} Using absolute path: ${relativePath}`)
    return relativePath
  }

  if (
    relativePath.startsWith('http://') ||
    relativePath.startsWith('https://')
  ) {
    console.debug(`${debugPrefix} Using URL: ${relativePath}`)
    return relativePath
  }

  // Use Gio for robust relative path resolution
  try {
    const baseFile = Gio.File.new_for_path(basePath.replace(/\/$/, ''))
    const resolvedFile = baseFile.resolve_relative_path(relativePath)
    const resolvedPath = resolvedFile.get_path()

    if (resolvedPath) {
      console.debug(`${debugPrefix} Gio resolved: ${resolvedPath}`)
      return resolvedPath
    }
  } catch (error) {
    console.warn(
      `${debugPrefix} Gio resolution failed, using fallback: ${error}`,
    )
  }

  // Fallback: manual path resolution
  const baseParts = basePath.replace(/\/$/, '').split('/')
  const relativeParts = relativePath.split('/')

  for (const part of relativeParts) {
    if (part === '..') {
      baseParts.pop()
    } else if (part !== '.' && part !== '') {
      baseParts.push(part)
    }
  }

  const fallbackPath = baseParts.join('/')
  console.debug(`${debugPrefix} Fallback resolved: ${fallbackPath}`)

  return fallbackPath
}
