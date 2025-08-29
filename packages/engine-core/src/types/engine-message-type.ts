/**
 * Unified engine message types for both commands and events
 */
export enum EngineMessageType {
  // Commands (imperative actions)
  START = 'start',
  STOP = 'stop',
  LOAD_PROJECT = 'load-project',
  LOAD_MAP = 'load-map',

  // Events (reactive notifications)
  STATUS_CHANGED = 'status-changed',
  PROJECT_LOADED = 'project-loaded',
  MAP_LOADED = 'map-loaded',
  ERROR = 'error',
  INPUT_EVENT = 'input-event',
}