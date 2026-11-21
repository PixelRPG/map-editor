import { Component } from 'excalibur'

/**
 * Presence-as-signal marker on the session singleton: while it is there,
 * `InputSystem` publishes neutral intent. It takes the player's steering,
 * not the world's time — combat, AI and animation keep ticking.
 *
 * Runtime only. Lives on the scene's singleton, so it is gone with the
 * scene it belonged to.
 */
export class ControlLockComponent extends Component {}
