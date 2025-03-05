import { FileReference } from './FileReference';

/**
 * Represents a reference to an audio file
 * Used for sound effects and music tracks
 */
export interface AudioReference extends FileReference {
    /**
     * The type is always 'audio' for audio references
     */
    type: 'audio';

    /**
     * Optional display name of the audio file
     */
    name?: string;

    /**
     * Optional category of the audio (music, sfx, voice, etc.)
     */
    category?: string;

    /**
     * Optional duration of the audio in seconds
     */
    duration?: number;

    /**
     * Optional default volume (0.0 to 1.0)
     */
    volume?: number;

    /**
     * Optional flag indicating if the audio should loop by default
     */
    loop?: boolean;
} 