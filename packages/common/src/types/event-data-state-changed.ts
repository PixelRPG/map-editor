export interface EventDataStateChanged<S = any> {
    name: 'state-changed';
    data: {
        // state: S;
        property: keyof S;
        value: S[keyof S];
        // TODO: Fix `DataCloneError: The object can not be cloned` error
        // ops: StateChangeOperation[];
    };
};

