interface IPrototype {
    prototype: object;
}
declare type TUndefined = {
    t: 'u';
};
declare type TNull = {
    t: 'z';
};
declare type TBoolean = {
    t: 'b';
    v: boolean;
};
declare type TNumber = {
    t: 'd';
    v: number;
};
declare type TBigInt = {
    t: 'n';
    v: string;
};
declare type TString = {
    t: 's';
    v: string;
};
declare type TSymbol = {
    t: '$';
    v: number;
};
declare type TValue = TUndefined | TNull | TBoolean | TNumber | TBigInt | TString | TSymbol;
declare type TArray = {
    t: 'a';
    v: (TAny | TPointer)[];
};
declare type TProperty = {
    t: '=';
    v: TAny | TPointer;
    w?: boolean;
    e?: boolean;
    c?: boolean;
} | {
    t: '(';
    g?: TFunction;
    s?: TFunction;
    e?: boolean;
    c?: boolean;
};
declare type TObject = {
    t: 'o';
    p: number;
    v: [string, TProperty][];
};
declare type TFunction = {
    t: 'f';
    v: number;
};
declare type TDate = {
    t: 'D';
    v: number;
};
declare type TMap = {
    t: 'M';
    v: [TAny, TAny][];
};
declare type TSet = {
    t: 'S';
    v: TAny[];
};
declare type TExtraordinary = TDate | TMap | TSet;
declare type TReference = TArray | TObject | TFunction | TExtraordinary;
declare type TPointers = TReference[];
declare type TPointer = {
    t: '*';
    v: number;
};
declare type TAny = TValue | TReference | TPointer;
export declare type Marshalled = [TPointers, TAny];
export default class Marshal {
    private readonly options;
    constructor(params?: {
        symbols?: symbol[];
        functions?: Function[];
        prototypes?: IPrototype[];
    });
    marshal(value: unknown): Marshalled;
    unmarshal([pointers, encoded]: Marshalled): unknown;
}
export {};
