# marshal-ts

Tiny JavaScript marshalling library with zero dependencies. Marshalling is like 
serialization, but you get the object identity (typeof, instanceof, methods) 
back on the other end. Supports circular references too!

## Install

```sh
npm install marshal-ts
```

## Usage

### Motivating Example

```ts
import { Marshal } from 'marshal-ts';

class Foo {
  constructor(public hello: string, private world: string) {}
  sayHello(): string {
    return this.hello + ' ' + this.world;
  }
}

const marshal = new Marshal({ prototypes: [Foo] });
const foo = new Foo('Hello', 'World');
const fooJson = marshal.marshal(foo);
// At this point, you can serialize fooJson with [JSON.stringify] and send it 
// over any kind of transport (write to a file, send over the internet, etc.)
const fooJsonSerialized = JSON.stringify(fooJson);
// ...
// ...and the receiving program can reconstruct it as long as it has the same
// codebase and marshal.
const fooJsonDecoded = JSON.parse(fooJsonSerialized);
const fooReconstructed = marshal.unmarshal(fooJsonDecoded) as Foo;

fooReconstructed.sayHello(); // 'Hello World'
```

The marshaller understands prototype inheritance:

```ts
class Bar extends Foo {
  sayHello(): string {
    return 'No greetings for you';
  }
}

const marshal = new Marshal({ prototypes: [Foo, Bar] });
const foo = new Foo('Hello', 'World');
const bar = new Bar('Hi', 'Earth');
let serializedFoo = JSON.stringify(marshal.marshal(foo));
let serializedBar = JSON.stringify(marshal.marshal(bar));
// ...
// NB: "as Foo" doesn't do anything here, it's just a TypeScript annotation
let reconstructedFoo = marshal.unmarshal(JSON.parse(serializedFoo)) as Foo;
reconstructedFoo.sayHello(); // 'Hello World'
reconstructedFoo instanceof Bar; // false
reconstructedFoo instanceof Foo; // true

let reconstructedBar = marshal.unmarshal(JSON.parse(serializedBar)) as Bar;
reconstructedBar.sayHello(); // 'Hi Earth'
reconstructedBar instanceof Bar; // true
```

## API

TODO