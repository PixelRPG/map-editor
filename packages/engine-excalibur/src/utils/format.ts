/**
 * Converts a blob to a base64 string
 * @param blob 
 * @returns 
 */
export const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64data = reader.result;
            resolve(base64data as string);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * Converts an image element to a canvas element
 * @param imageElement 
 * @returns 
 */
const getImageCanvas = (imageElement: HTMLImageElement): HTMLCanvasElement => {
    // Create a canvas element
    const canvas = document.createElement('canvas');
    canvas.width = imageElement.naturalWidth;
    canvas.height = imageElement.naturalHeight;

    // Draw the image on the canvas
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Could not get canvas context');
    }
    ctx.drawImage(imageElement, 0, 0);

    return canvas;
}

/**
 * Converts an image element to a blob
 * @param imageElement 
 * @returns 
 */
export const getImageBlob = (imageElement: HTMLImageElement): Promise<Blob> => {
    const canvas = getImageCanvas(imageElement);

    // Extract the image as a blob
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                return reject(new Error('Could not get blob'));
            }
            resolve(blob);
        });
    });
}

/**
 * Converts an image element to a base64 string
 * @param imageElement 
 * @returns 
 */
export const getImageBase64 = (imageElement: HTMLImageElement): string => {
    const canvas = getImageCanvas(imageElement);

    // Extract the image as a data URL
    const dataUrl = canvas.toDataURL('image/png');
    return dataUrl;
}

/**
 * Get the mime type of an image element
 * @param imageElement 
 * @returns 
 */
export const getImageMimeType = async (imageElement: HTMLImageElement): Promise<string> => {
    const blob = await getImageBlob(imageElement);
    return blob.type;
}

