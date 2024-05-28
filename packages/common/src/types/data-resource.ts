/**
 * A data resource is a resource file.
 * To keep the size of the JSON to be transferred small,
 * this is only a reference to the file and does not contain the file itself.
 */
export interface DataResource {
    mimeType: 'image/png' | 'unknown'
    path: string
}

