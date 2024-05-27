import type { StateChangeOperation } from "./index.ts"
import type { Snapshot } from 'valtio/vanilla'

export interface EventDataStateChanged<T = any> {
    name: 'state-changed';
    data: {
        // state: Snapshot<T>;
        state: T;
        // TODO: Fix `DataCloneError: The object can not be cloned` error
        // ops: StateChangeOperation[];
    };
};

