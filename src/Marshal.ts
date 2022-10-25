/* eslint-disable @typescript-eslint/ban-types -- the inferred type of
 * Object.create parameter is object | null, so we use object */

/**
 * NB: Taxonomy of ECMAScript objects
 *
 * ECMAScript specifies two types of objects: ordinary objects, which implement
 * a certain set of internal methods with the default algorithms; and exotic
 * objects, such as Array, which override some of those set internal methods
 * with non-standard algorithms.
 *
 * In fact, its useful to consider a subset of ordinary objects, or
 * "extraordinary" objects, which although they are ordinary, additionally
 * define some extra internal slots which make them unsuitable for generic
 * marshalling. For example, Date objects are ordinary, but store their value
 * in an internal [[DateValue]] slot which is not accessible.
 *
 * For completion, we would consider exotic objects with extra slots to be
 * "superexotic", but this distinction would be a moot point as exotic objects
 * are already non-marshallable by default unless a specific case is made.
 *
 * Deliberately unsupported:
 *
 * - Symbol keys on objects (unsure if right choice, considering we do attrs)
 * - WeakMap, WeakSet
 *
 * Deliberately hard to do:
 *
 * - Objects with getters/setters need to have those accessors declared up-front
 *   in [options.functions], just like all the other functions
 */

// CR: isn't Error extraordinary? conjure a test case that breaks
// CR-someday: support typed Arrays (Int8Array, etc.)
// CR: unroll recursion to support infinite stack depth
// CR: can we even type this completely? I think basically not...convert to plain js to make this clear
// CR: check edge cases e.g. https://stackoverflow.com/questions/2464426/whats-the-difference-between-isprototypeof-and-instanceof-in-javascript
// CR-someday: is versioning possible? maybe its an orthogonal concern

type SymbolEncoder = {
  encoder: Map<symbol, number>;
  decoder: symbol[];
};

type FunctionEncoder = {
  encoder: Map<Function, number>;
  decoder: Function[];
};

interface IPrototype {
  prototype: object;
}

type PrototypeEncoder = {
  // Prototypes in chain order
  poset: IPrototype[];
};

type PointerEncoder = {
  encoder: Map<object, number>;
  pointers: TPointers;
};

type PointerDecoder = {
  decoder: Map<number, object>;
  pointers: TPointers;
};

type TUndefined = { t: 'u' };
type TNull = { t: 'z' };
type TBoolean = { t: 'b'; v: boolean };
type TNumber = { t: 'd'; v: number };
type TBigInt = { t: 'n'; v: string };
type TString = { t: 's'; v: string };
type TSymbol = { t: '$'; v: number };

type TValue =
  | TUndefined
  | TNull
  | TBoolean
  | TNumber
  | TBigInt
  | TString
  | TSymbol;

type TArray = { t: 'a'; v: (TAny | TPointer)[] };
type TProperty =
  | {
      t: '=';
      v: TAny | TPointer;
      w?: boolean; // writable
      e?: boolean; // enumerable
      c?: boolean; // configurable
    }
  | {
      t: '(';
      g?: TFunction; // getter
      s?: TFunction; // setter
      e?: boolean; // enumerable
      c?: boolean; // configurable
    };
type TObject = {
  t: 'o';
  // object prototype; must include Object in PrototypeTable if POJOs are to be
  // supported, no special case for it
  p: number;
  v: [string, TProperty][];
};
type TFunction = { t: 'f'; v: number };

type TDate = { t: 'D'; v: number };
type TMap = { t: 'M'; v: [TAny, TAny][] };
type TSet = { t: 'S'; v: TAny[] };
type TExtraordinary = TDate | TMap | TSet;

type TReference = TArray | TObject | TFunction | TExtraordinary;
type TPointers = TReference[];
type TPointer = { t: '*'; v: number };

type TAny = TValue | TReference | TPointer;

export type Marshalled = [TPointers, TAny];

type Options = {
  symbols: SymbolEncoder;
  functions: FunctionEncoder;
  prototypes: PrototypeEncoder;
};

function encodeFunction(fn: Function, functions: FunctionEncoder): TFunction {
  const v = functions.encoder.get(fn);
  if (v === undefined) {
    throw new Error(`unknown function ${fn.name}`);
  }
  return { t: 'f', v };
}

function decodeFunction(
  value: TFunction,
  functions: FunctionEncoder,
): Function {
  const v = functions.decoder[value.v];
  if (v === undefined) {
    throw new Error(`unknown function ${value.v}`);
  }
  return v;
}

function encodeStringProperties(
  value: object,
  pointerEncoder: PointerEncoder,
  options: Options,
): [string, TProperty][] {
  const v: [string, TProperty][] = [];
  for (const prop of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, prop);
    if (descriptor === undefined) {
      throw Error('assert');
    }

    if (descriptor.get !== undefined || descriptor.set !== undefined) {
      if (descriptor.value !== undefined) {
        throw Error('assert');
      }
      v.push([
        prop,
        {
          t: '(',
          g:
            descriptor.get === undefined
              ? undefined
              : encodeFunction(descriptor.get, options.functions),
          s:
            descriptor.set === undefined
              ? undefined
              : encodeFunction(descriptor.set, options.functions),
          e: descriptor.enumerable,
          c: descriptor.configurable,
        },
      ]);
    } else {
      v.push([
        prop,
        {
          t: '=',
          v: encode(descriptor.value, pointerEncoder, options),
          w: descriptor.writable,
          e: descriptor.enumerable,
          c: descriptor.configurable,
        },
      ]);
    }
  }
  return v;
}

function encodeReference(
  value: object,
  pointerEncoder: PointerEncoder,
  options: Options,
): TReference {
  const { prototypes } = options;
  if (value instanceof Date) {
    return { t: 'D', v: value.getTime() };
  } else if (value instanceof Map) {
    return {
      t: 'M',
      v: [...value.entries()].map(([k, e]) => [
        encode(k, pointerEncoder, options),
        encode(e, pointerEncoder, options),
      ]),
    };
  } else if (value instanceof Set) {
    return {
      t: 'S',
      v: [...value.values()].map((e) => encode(e, pointerEncoder, options)),
    };
  } else if (value instanceof Array) {
    return {
      t: 'a',
      v: value.map((item) => encode(item, pointerEncoder, options)),
    };
  } else {
    const p = prototypes.poset.findIndex((obj) =>
      Object.prototype.isPrototypeOf.call(obj.prototype, value),
    );
    if (p === -1) {
      // No exceptions for POJOs--must explicitly opt-in Object
      throw new Error(`unknown constructor ${value.constructor.name}`);
    }
    return {
      t: 'o',
      p,
      v: encodeStringProperties(value, pointerEncoder, options),
    };
  }
}

function encode(
  value: unknown,
  pointerEncoder: PointerEncoder,
  options: Options,
): TAny {
  const { symbols, functions } = options;
  switch (typeof value) {
    case 'undefined':
      return { t: 'u' };
    case 'boolean':
      return { t: 'b', v: value };
    case 'number':
      return { t: 'd', v: value };
    case 'bigint':
      return { t: 'n', v: value.toString() };
    case 'string':
      return { t: 's', v: value };
    case 'symbol': {
      const v = symbols.encoder.get(value);
      if (v === undefined) {
        throw new Error(`unknown symbol ${value.toString()}`);
      }
      return { t: '$', v };
    }
    case 'function': {
      return encodeFunction(value, functions);
    }
    case 'object': {
      if (value === null) {
        return { t: 'z' };
      } else {
        const pointer = pointerEncoder.encoder.get(value);
        if (pointer !== undefined) {
          return { t: '*', v: pointer };
        } else {
          const encoded = encodeReference(value, pointerEncoder, options);
          const v = pointerEncoder.pointers.length;
          pointerEncoder.pointers.push(encoded);
          pointerEncoder.encoder.set(value, v);
          return { t: '*', v };
        }
      }
    }
  }
}

function decode(
  value: TAny,
  pointerDecoder: PointerDecoder,
  options: Options,
): unknown {
  const { symbols, functions, prototypes } = options;
  switch (value.t) {
    case 'u':
      return <undefined>undefined;
    case 'z':
      return <null>null;
    case 'b':
      return <boolean>value.v;
    case 'd':
      return <number>value.v;
    case 'n':
      return <bigint>BigInt(value.v);
    case 's':
      return <string>value.v;
    case '$': {
      const v = symbols.decoder[value.v];
      if (v) {
        return <symbol>v;
      } else {
        throw new Error(`unknown symbol ${value.v}`);
      }
    }
    case 'D':
      return <Date>new Date(value.v);
    case 'M':
      return new Map(
        value.v.map(([k, e]) => [
          decode(k, pointerDecoder, options),
          decode(e, pointerDecoder, options),
        ]),
      );
    case 'S':
      return new Set(value.v.map((v) => decode(v, pointerDecoder, options)));
    case 'a':
      return <unknown[]>(
        value.v.map((item) => decode(item, pointerDecoder, options))
      );
    case 'o': {
      const p = prototypes.poset[value.p];
      if (p === undefined) {
        throw new Error(`unknown constructor ${value.p}`);
      }
      const o = Object.create(p.prototype);
      for (const [name, property] of value.v) {
        if (property.t === '=') {
          Object.defineProperty(o, name, {
            value: decode(property.v, pointerDecoder, options),
            writable: property.w,
            enumerable: property.e,
            configurable: property.c,
          });
        } else if (property.t === '(') {
          Object.defineProperty(o, name, {
            get:
              property.g === undefined
                ? undefined
                : (decodeFunction(property.g, functions) as () => unknown),
            set:
              property.s === undefined
                ? undefined
                : (decodeFunction(property.s, functions) as (
                    v: unknown,
                  ) => void),
            enumerable: property.e,
            configurable: property.c,
          });
        }
      }
      return o;
    }
    case 'f': {
      return decodeFunction(value, functions);
    }
    case '*': {
      const v = pointerDecoder.decoder.get(value.v);
      if (v === undefined) {
        const undecoded = pointerDecoder.pointers[value.v];
        if (undecoded === undefined) {
          throw new Error(`invalid pointer ${value.v}`);
        }
        const decoded = decode(undecoded, pointerDecoder, options) as object;
        pointerDecoder.decoder.set(value.v, decoded);
        return decoded;
      } else {
        return v;
      }
    }
  }
}

const BUILT_IN_OBJECTS = [Object, Error];

export default class Marshal {
  private readonly options: Options;

  constructor(params?: {
    symbols?: symbol[];
    functions?: Function[];
    prototypes?: IPrototype[];
  }) {
    this.options = {
      symbols: {
        encoder: new Map(),
        decoder: params?.symbols || [],
      },
      functions: {
        encoder: new Map(),
        decoder: params?.functions || [],
      },
      prototypes: {
        poset: (params?.prototypes || []).concat(BUILT_IN_OBJECTS),
      },
    };
    this.options.symbols.decoder.forEach((symbol, i) =>
      this.options.symbols.encoder.set(symbol, i),
    );
    this.options.functions.decoder.forEach((fn, i) =>
      this.options.functions.encoder.set(fn, i),
    );
    // NB: indifferent to sort stability
    this.options.prototypes.poset.sort((a, b) =>
      Object.prototype.isPrototypeOf.call(a.prototype, b.prototype) ? 1 : -1,
    );
  }

  marshal(value: unknown): Marshalled {
    const pointerEncoder = {
      encoder: new Map(),
      pointers: [],
    };
    const encoded = encode(value, pointerEncoder, this.options);
    return [pointerEncoder.pointers, encoded];
  }

  unmarshal([pointers, encoded]: Marshalled): unknown {
    const pointerDecoder = {
      decoder: new Map(),
      pointers,
    };
    return decode(encoded, pointerDecoder, this.options);
  }
}
