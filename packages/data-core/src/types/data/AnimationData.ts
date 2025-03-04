import type { AnimationFrame, AnimationStrategy } from "./index";

/**
 * Animation definition
 */
export interface AnimationData {
    /**
     * Unique identifier for this animation
     */
    id: string;

    /**
     * Optional name for the animation
     */
    name?: string;

    /**
     * Array of frame definitions
     */
    frames: AnimationFrame[];

    /**
     * Animation strategy
     * - 'end': Animation ends without displaying anything
     * - 'loop' (default): Animation loops to the first frame after the last frame
     * - 'pingpong': Animation plays to the last frame, then backwards to first frame
     * - 'freeze': Animation ends stopping on the last frame
     */
    strategy: AnimationStrategy;
}