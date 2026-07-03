import { Component } from 'excalibur'
import type { ActionData } from '../types/data/ActionData.ts'

/**
 * The ordered action list an event runs when its paired
 * {@link TriggerComponent} fires — the RPG-Maker "event page" body.
 *
 * Pure data (like {@link DialogueComponent} / {@link ScriptRefComponent}):
 * it carries the {@link ActionData} sequence but performs nothing itself.
 * The runtime {@link EventActionSystem} reads it on `TRIGGER_FIRED` and
 * executes the actions in order (added in the runtime PR); until then the
 * component is inert, so authoring round-trips through save / load /
 * collab / undo with no behavioural coupling.
 */
export class EventActionsComponent extends Component {
  constructor(public actions: ActionData[]) {
    super()
  }
}
