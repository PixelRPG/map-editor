export interface EventDataStateChanged<S = any> {
    name: 'state-changed';
    data: {
        /** The property that has been changed */
        property: keyof S;
        /** The value of the property */
        value: S[keyof S];
    };
};

