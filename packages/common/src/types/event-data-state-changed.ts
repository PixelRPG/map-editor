import type { StateChangeOperation } from "./index.ts"

export interface EventDataStateChanged {
    name: 'state-changed';
    data: {
        state: any;
        // ops: StateChangeOperation[];
    };
};

