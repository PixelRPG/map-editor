import {
    EngineEvent,
    EngineEventDataMap,
    EngineEventType,
    EngineMessageEventEngine,
    EngineMessageType,
    EngineStatus
} from '../types/index';
import { isNonNullObject, hasStringProperty, hasNonEmptyStringProperty } from './validation';

/**
 * Get the event type from an engine event message
 */
export const getEventType = (message: EngineMessageEventEngine): EngineEventType => {
    return message.payload.type;
};

/**
 * Get the event data from an engine event message
 */
export const getEventData = <T extends EngineEventType>(
    message: EngineMessageEventEngine
): EngineEventDataMap[T] => {
    return message.payload.data as EngineEventDataMap[T];
};

/**
 * Create an engine event message
 */
export const createEngineEventMessage = <T extends EngineEventType>(
    event: EngineEvent<T>
): EngineMessageEventEngine => {
    return {
        messageType: EngineMessageType.ENGINE_EVENT,
        payload: event
    };
};

/**
 * Check if an event is a status changed event
 */
export const isStatusChangedEvent = (event: EngineEvent): event is EngineEvent<EngineEventType.STATUS_CHANGED> => {
    return event.type === EngineEventType.STATUS_CHANGED &&
        typeof event.data === 'string' &&
        Object.values(EngineStatus).includes(event.data as EngineStatus);
};

/**
 * Check if an event is a project loaded event
 */
export const isProjectLoadedEvent = (event: EngineEvent): event is EngineEvent<EngineEventType.PROJECT_LOADED> => {
    return event.type === EngineEventType.PROJECT_LOADED &&
        isNonNullObject(event.data) &&
        hasNonEmptyStringProperty(event.data, 'projectId');
};

/**
 * Check if an event is a map loaded event
 */
export const isMapLoadedEvent = (event: EngineEvent): event is EngineEvent<EngineEventType.MAP_LOADED> => {
    return event.type === EngineEventType.MAP_LOADED &&
        isNonNullObject(event.data) &&
        hasNonEmptyStringProperty(event.data, 'mapId');
};

/**
 * Check if an event is an error event
 */
export const isErrorEvent = (event: EngineEvent): event is EngineEvent<EngineEventType.ERROR> => {
    return event.type === EngineEventType.ERROR &&
        isNonNullObject(event.data) &&
        hasStringProperty(event.data, 'message');
}; 