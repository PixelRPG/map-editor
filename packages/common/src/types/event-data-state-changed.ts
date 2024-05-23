import type { StateChangeOperation } from "./index.ts"

export interface EventDataStateChanged {
    name: 'state-changed';
    data: {
        state: any;
        // TODO: Fix `DataCloneError: The object can not be cloned` error
        // ops: StateChangeOperation[];
    };
};

