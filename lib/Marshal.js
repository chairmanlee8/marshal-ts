/* eslint-disable @typescript-eslint/ban-types -- the inferred type of
 * Object.create parameter is object | null, so we use object */
function encodeFunction(fn, functions) {
    const v = functions.encoder.get(fn);
    if (v === undefined) {
        throw new Error(`unknown function ${fn.name}`);
    }
    return { t: 'f', v };
}
function decodeFunction(value, functions) {
    const v = functions.decoder[value.v];
    if (v === undefined) {
        throw new Error(`unknown function ${value.v}`);
    }
    return v;
}
function encodeStringProperties(value, pointerEncoder, options) {
    const v = [];
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
                    g: descriptor.get === undefined
                        ? undefined
                        : encodeFunction(descriptor.get, options.functions),
                    s: descriptor.set === undefined
                        ? undefined
                        : encodeFunction(descriptor.set, options.functions),
                    e: descriptor.enumerable,
                    c: descriptor.configurable,
                },
            ]);
        }
        else {
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
function encodeReference(value, pointerEncoder, options) {
    const { prototypes } = options;
    if (value instanceof Date) {
        return { t: 'D', v: value.getTime() };
    }
    else if (value instanceof Map) {
        return {
            t: 'M',
            v: [...value.entries()].map(([k, e]) => [
                encode(k, pointerEncoder, options),
                encode(e, pointerEncoder, options),
            ]),
        };
    }
    else if (value instanceof Set) {
        return {
            t: 'S',
            v: [...value.values()].map((e) => encode(e, pointerEncoder, options)),
        };
    }
    else if (value instanceof Array) {
        return {
            t: 'a',
            v: value.map((item) => encode(item, pointerEncoder, options)),
        };
    }
    else {
        const p = prototypes.poset.findIndex((obj) => Object.prototype.isPrototypeOf.call(obj.prototype, value));
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
function encode(value, pointerEncoder, options) {
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
            }
            else {
                const pointer = pointerEncoder.encoder.get(value);
                if (pointer !== undefined) {
                    return { t: '*', v: pointer };
                }
                else {
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
function decode(value, pointerDecoder, options) {
    const { symbols, functions, prototypes } = options;
    switch (value.t) {
        case 'u':
            return undefined;
        case 'z':
            return null;
        case 'b':
            return value.v;
        case 'd':
            return value.v;
        case 'n':
            return BigInt(value.v);
        case 's':
            return value.v;
        case '$': {
            const v = symbols.decoder[value.v];
            if (v) {
                return v;
            }
            else {
                throw new Error(`unknown symbol ${value.v}`);
            }
        }
        case 'D':
            return new Date(value.v);
        case 'M':
            return new Map(value.v.map(([k, e]) => [
                decode(k, pointerDecoder, options),
                decode(e, pointerDecoder, options),
            ]));
        case 'S':
            return new Set(value.v.map((v) => decode(v, pointerDecoder, options)));
        case 'a':
            return (value.v.map((item) => decode(item, pointerDecoder, options)));
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
                }
                else if (property.t === '(') {
                    Object.defineProperty(o, name, {
                        get: property.g === undefined
                            ? undefined
                            : decodeFunction(property.g, functions),
                        set: property.s === undefined
                            ? undefined
                            : decodeFunction(property.s, functions),
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
                const decoded = decode(undecoded, pointerDecoder, options);
                pointerDecoder.decoder.set(value.v, decoded);
                return decoded;
            }
            else {
                return v;
            }
        }
    }
}
const BUILT_IN_OBJECTS = [Object, Error];
export default class Marshal {
    constructor(params) {
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
        this.options.symbols.decoder.forEach((symbol, i) => this.options.symbols.encoder.set(symbol, i));
        this.options.functions.decoder.forEach((fn, i) => this.options.functions.encoder.set(fn, i));
        // NB: indifferent to sort stability
        this.options.prototypes.poset.sort((a, b) => Object.prototype.isPrototypeOf.call(a.prototype, b.prototype) ? 1 : -1);
    }
    marshal(value) {
        const pointerEncoder = {
            encoder: new Map(),
            pointers: [],
        };
        const encoded = encode(value, pointerEncoder, this.options);
        return [pointerEncoder.pointers, encoded];
    }
    unmarshal([pointers, encoded]) {
        const pointerDecoder = {
            decoder: new Map(),
            pointers,
        };
        return decode(encoded, pointerDecoder, this.options);
    }
}
