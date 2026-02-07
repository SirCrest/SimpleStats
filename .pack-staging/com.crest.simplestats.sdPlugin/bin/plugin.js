'use strict';

var require$$0$3 = require('events');
var require$$1$1 = require('https');
var require$$2 = require('http');
var require$$3 = require('net');
var require$$4 = require('tls');
var require$$1 = require('crypto');
var require$$0$2 = require('stream');
var require$$7 = require('url');
var require$$0 = require('zlib');
var require$$0$1 = require('buffer');
var fs = require('node:fs');
var path = require('node:path');
var node_process = require('node:process');
var node_crypto = require('node:crypto');
var os = require('node:os');
var node_child_process = require('node:child_process');
var node_perf_hooks = require('node:perf_hooks');

/**
 * Default language supported by all i18n providers.
 */
const defaultLanguage = "en";

/**
 * Creates a {@link IDisposable} that defers the disposing to the {@link dispose} function; disposing is guarded so that it may only occur once.
 * @param dispose Function responsible for disposing.
 * @returns Disposable whereby the disposing is delegated to the {@link dispose}  function.
 */
function deferredDisposable(dispose) {
    let isDisposed = false;
    const guardedDispose = () => {
        if (!isDisposed) {
            dispose();
            isDisposed = true;
        }
    };
    return {
        [Symbol.dispose]: guardedDispose,
        dispose: guardedDispose,
    };
}

/**
 * An event emitter that enables the listening for, and emitting of, events.
 */
let EventEmitter$1 = class EventEmitter {
    /**
     * Underlying collection of events and their listeners.
     */
    events = new Map();
    /**
     * Adds the event {@link listener} for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @returns This instance with the {@link listener} added.
     */
    addListener(eventName, listener) {
        return this.add(eventName, listener, (listeners) => listeners.push({ listener }));
    }
    /**
     * Adds the event {@link listener} for the event named {@link eventName}, and returns a disposable capable of removing the event listener.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @returns A disposable that removes the listener when disposed.
     */
    disposableOn(eventName, listener) {
        this.add(eventName, listener, (listeners) => listeners.push({ listener }));
        return deferredDisposable(() => this.removeListener(eventName, listener));
    }
    /**
     * Emits the {@link eventName}, invoking all event listeners with the specified {@link args}.
     * @param eventName Name of the event.
     * @param args Arguments supplied to each event listener.
     * @returns `true` when there was a listener associated with the event; otherwise `false`.
     */
    emit(eventName, ...args) {
        const listeners = this.events.get(eventName);
        if (listeners === undefined) {
            return false;
        }
        for (let i = 0; i < listeners.length;) {
            const { listener, once } = listeners[i];
            if (once) {
                this.remove(eventName, listeners, i);
            }
            else {
                i++;
            }
            listener(...args);
        }
        return true;
    }
    /**
     * Gets the event names with event listeners.
     * @returns Event names.
     */
    eventNames() {
        return Array.from(this.events.keys());
    }
    /**
     * Gets the number of event listeners for the event named {@link eventName}. When a {@link listener} is defined, only matching event listeners are counted.
     * @param eventName Name of the event.
     * @param listener Optional event listener to count.
     * @returns Number of event listeners.
     */
    listenerCount(eventName, listener) {
        const listeners = this.events.get(eventName);
        if (listeners === undefined || listener == undefined) {
            return listeners?.length || 0;
        }
        let count = 0;
        listeners.forEach((ev) => {
            if (ev.listener === listener) {
                count++;
            }
        });
        return count;
    }
    /**
     * Gets the event listeners for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @returns The event listeners.
     */
    listeners(eventName) {
        return Array.from(this.events.get(eventName) || []).map(({ listener }) => listener);
    }
    /**
     * Removes the event {@link listener} for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @returns This instance with the event {@link listener} removed.
     */
    off(eventName, listener) {
        const listeners = this.events.get(eventName) ?? [];
        for (let i = listeners.length - 1; i >= 0; i--) {
            if (listeners[i].listener === listener) {
                this.remove(eventName, listeners, i);
            }
        }
        return this;
    }
    /**
     * Adds the event {@link listener} for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @returns This instance with the event {@link listener} added.
     */
    on(eventName, listener) {
        return this.add(eventName, listener, (listeners) => listeners.push({ listener }));
    }
    /**
     * Adds the **one-time** event {@link listener} for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @returns This instance with the event {@link listener} added.
     */
    once(eventName, listener) {
        return this.add(eventName, listener, (listeners) => listeners.push({ listener, once: true }));
    }
    /**
     * Adds the event {@link listener} to the beginning of the listeners for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @returns This instance with the event {@link listener} prepended.
     */
    prependListener(eventName, listener) {
        return this.add(eventName, listener, (listeners) => listeners.splice(0, 0, { listener }));
    }
    /**
     * Adds the **one-time** event {@link listener} to the beginning of the listeners for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @returns This instance with the event {@link listener} prepended.
     */
    prependOnceListener(eventName, listener) {
        return this.add(eventName, listener, (listeners) => listeners.splice(0, 0, { listener, once: true }));
    }
    /**
     * Removes all event listeners for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @returns This instance with the event listeners removed
     */
    removeAllListeners(eventName) {
        const listeners = this.events.get(eventName) ?? [];
        while (listeners.length > 0) {
            this.remove(eventName, listeners, 0);
        }
        this.events.delete(eventName);
        return this;
    }
    /**
     * Removes the event {@link listener} for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @returns This instance with the event {@link listener} removed.
     */
    removeListener(eventName, listener) {
        return this.off(eventName, listener);
    }
    /**
     * Adds the event {@link listener} for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @param fn Function responsible for adding the new event handler function.
     * @returns This instance with event {@link listener} added.
     */
    add(eventName, listener, fn) {
        let listeners = this.events.get(eventName);
        if (listeners === undefined) {
            listeners = [];
            this.events.set(eventName, listeners);
        }
        fn(listeners);
        if (eventName !== "newListener") {
            const args = [eventName, listener];
            this.emit("newListener", ...args);
        }
        return this;
    }
    /**
     * Removes the listener at the given index.
     * @param eventName Name of the event.
     * @param listeners Listeners registered with the event.
     * @param index Index of the listener to remove.
     */
    remove(eventName, listeners, index) {
        const [{ listener }] = listeners.splice(index, 1);
        if (eventName !== "removeListener") {
            const args = [eventName, listener];
            this.emit("removeListener", ...args);
        }
    }
};

/**
 * Prevents the modification of existing property attributes and values on the value, and all of its child properties, and prevents the addition of new properties.
 * @param value Value to freeze.
 */
function freeze(value) {
    if (value !== undefined && value !== null && typeof value === "object" && !Object.isFrozen(value)) {
        Object.freeze(value);
        Object.values(value).forEach(freeze);
    }
}
/**
 * Gets the value at the specified {@link path}.
 * @param source Source object that is being read from.
 * @param path Path to the property to get.
 * @returns Value of the property.
 */
function get(source, path) {
    const props = path.split(".");
    return props.reduce((obj, prop) => obj && obj[prop], source);
}

/**
 * Internalization provider, responsible for managing localizations and translating resources.
 */
class I18nProvider {
    /**
     * Backing field for the default language.
     */
    #language;
    /**
     * Map of localized resources, indexed by their language.
     */
    #translations = new Map();
    /**
     * Function responsible for providing localized resources for a given language.
     */
    #readTranslations;
    /**
     * Internal events handler.
     */
    #events = new EventEmitter$1();
    /**
     * Initializes a new instance of the {@link I18nProvider} class.
     * @param language The default language to be used when retrieving translations for a given key.
     * @param readTranslations Function responsible for providing localized resources for a given language.
     */
    constructor(language, readTranslations) {
        this.#language = language;
        this.#readTranslations = readTranslations;
    }
    /**
     * The default language of the provider.
     * @returns The language.
     */
    get language() {
        return this.#language;
    }
    /**
     * The default language of the provider.
     * @param value The language.
     */
    set language(value) {
        if (this.#language !== value) {
            this.#language = value;
            this.#events.emit("languageChange", value);
        }
    }
    /**
     * Adds an event listener that is called when the language within the provider changes.
     * @param listener Listener function to be called.
     * @returns Resource manager that, when disposed, removes the event listener.
     */
    onLanguageChange(listener) {
        return this.#events.disposableOn("languageChange", listener);
    }
    /**
     * Translates the specified {@link key}, as defined within the resources for the {@link language}.
     * When the key is not found, the default language is checked. Alias of {@link I18nProvider.translate}.
     * @param key Key of the translation.
     * @param language Optional language to get the translation for; otherwise the default language.
     * @returns The translation; otherwise the key.
     */
    t(key, language = this.language) {
        return this.translate(key, language);
    }
    /**
     * Translates the specified {@link key}, as defined within the resources for the {@link language}.
     * When the key is not found, the default language is checked.
     * @param key Key of the translation.
     * @param language Optional language to get the translation for; otherwise the default language.
     * @returns The translation; otherwise the key.
     */
    translate(key, language = this.language) {
        // Determine the languages to search for.
        const languages = new Set([
            language,
            language.replaceAll("_", "-").split("-").at(0),
            defaultLanguage,
        ]);
        // Attempt to find the resource for the languages.
        for (const language of languages) {
            const resource = get(this.getTranslations(language), key);
            if (resource) {
                return resource.toString();
            }
        }
        // Otherwise fallback to the key.
        return key;
    }
    /**
     * Gets the translations for the specified language.
     * @param language Language whose translations are being retrieved.
     * @returns The translations; otherwise `null`.
     */
    getTranslations(language) {
        let translations = this.#translations.get(language);
        if (translations === undefined) {
            translations = this.#readTranslations(language);
            freeze(translations);
            this.#translations.set(language, translations);
        }
        return translations;
    }
}

/**
 * Provides a read-only iterable collection of items that also acts as a partial polyfill for iterator helpers.
 */
class Enumerable {
    /**
     * Backing function responsible for providing the iterator of items.
     */
    #items;
    /**
     * Backing function for {@link Enumerable.length}.
     */
    #length;
    /**
     * Captured iterator from the underlying iterable; used to fulfil {@link IterableIterator} methods.
     */
    #iterator;
    /**
     * Initializes a new instance of the {@link Enumerable} class.
     * @param source Source that contains the items.
     * @returns The enumerable.
     */
    constructor(source) {
        if (source instanceof Enumerable) {
            // Enumerable
            this.#items = source.#items;
            this.#length = source.#length;
        }
        else if (Array.isArray(source)) {
            // Array
            this.#items = () => source.values();
            this.#length = () => source.length;
        }
        else if (source instanceof Map || source instanceof Set) {
            // Map or Set
            this.#items = () => source.values();
            this.#length = () => source.size;
        }
        else {
            // IterableIterator delegate
            this.#items = source;
            this.#length = () => {
                let i = 0;
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                for (const _ of this) {
                    i++;
                }
                return i;
            };
        }
    }
    /**
     * Gets the number of items in the enumerable.
     * @returns The number of items.
     */
    get length() {
        return this.#length();
    }
    /**
     * Gets the iterator for the enumerable.
     * @yields The items.
     */
    *[Symbol.iterator]() {
        for (const item of this.#items()) {
            yield item;
        }
    }
    /**
     * Transforms each item within this iterator to an indexed pair, with each pair represented as an array.
     * @returns An iterator of indexed pairs.
     */
    asIndexedPairs() {
        return new Enumerable(function* () {
            let i = 0;
            for (const item of this) {
                yield [i++, item];
            }
        }.bind(this));
    }
    /**
     * Returns an iterator with the first items dropped, up to the specified limit.
     * @param limit The number of elements to drop from the start of the iteration.
     * @returns An iterator of items after the limit.
     */
    drop(limit) {
        if (isNaN(limit) || limit < 0) {
            throw new RangeError("limit must be 0, or a positive number");
        }
        return new Enumerable(function* () {
            let i = 0;
            for (const item of this) {
                if (i++ >= limit) {
                    yield item;
                }
            }
        }.bind(this));
    }
    /**
     * Determines whether all items satisfy the specified predicate.
     * @param predicate Function that determines whether each item fulfils the predicate.
     * @returns `true` when all items satisfy the predicate; otherwise `false`.
     */
    every(predicate) {
        for (const item of this) {
            if (!predicate(item)) {
                return false;
            }
        }
        return true;
    }
    /**
     * Returns an iterator of items that meet the specified predicate..
     * @param predicate Function that determines which items to filter.
     * @returns An iterator of filtered items.
     */
    filter(predicate) {
        return new Enumerable(function* () {
            for (const item of this) {
                if (predicate(item)) {
                    yield item;
                }
            }
        }.bind(this));
    }
    /**
     * Finds the first item that satisfies the specified predicate.
     * @param predicate Predicate to match items against.
     * @returns The first item that satisfied the predicate; otherwise `undefined`.
     */
    find(predicate) {
        for (const item of this) {
            if (predicate(item)) {
                return item;
            }
        }
    }
    /**
     * Finds the last item that satisfies the specified predicate.
     * @param predicate Predicate to match items against.
     * @returns The first item that satisfied the predicate; otherwise `undefined`.
     */
    findLast(predicate) {
        let result = undefined;
        for (const item of this) {
            if (predicate(item)) {
                result = item;
            }
        }
        return result;
    }
    /**
     * Returns an iterator containing items transformed using the specified mapper function.
     * @param mapper Function responsible for transforming each item.
     * @returns An iterator of transformed items.
     */
    flatMap(mapper) {
        return new Enumerable(function* () {
            for (const item of this) {
                for (const mapped of mapper(item)) {
                    yield mapped;
                }
            }
        }.bind(this));
    }
    /**
     * Iterates over each item, and invokes the specified function.
     * @param fn Function to invoke against each item.
     */
    forEach(fn) {
        for (const item of this) {
            fn(item);
        }
    }
    /**
     * Determines whether the search item exists in the collection exists.
     * @param search Item to search for.
     * @returns `true` when the item was found; otherwise `false`.
     */
    includes(search) {
        return this.some((item) => item === search);
    }
    /**
     * Returns an iterator of mapped items using the mapper function.
     * @param mapper Function responsible for mapping the items.
     * @returns An iterator of mapped items.
     */
    map(mapper) {
        return new Enumerable(function* () {
            for (const item of this) {
                yield mapper(item);
            }
        }.bind(this));
    }
    /**
     * Captures the underlying iterable, if it is not already captured, and gets the next item in the iterator.
     * @param args Optional values to send to the generator.
     * @returns An iterator result of the current iteration; when `done` is `false`, the current `value` is provided.
     */
    next(...args) {
        this.#iterator ??= this.#items();
        const result = this.#iterator.next(...args);
        if (result.done) {
            this.#iterator = undefined;
        }
        return result;
    }
    /**
     * Applies the accumulator function to each item, and returns the result.
     * @param accumulator Function responsible for accumulating all items within the collection.
     * @param initial Initial value supplied to the accumulator.
     * @returns Result of accumulating each value.
     */
    reduce(accumulator, initial) {
        if (this.length === 0) {
            if (initial === undefined) {
                throw new TypeError("Reduce of empty enumerable with no initial value.");
            }
            return initial;
        }
        let result = initial;
        for (const item of this) {
            if (result === undefined) {
                result = item;
            }
            else {
                result = accumulator(result, item);
            }
        }
        return result;
    }
    /**
     * Acts as if a `return` statement is inserted in the generator's body at the current suspended position.
     *
     * Please note, in the context of an {@link Enumerable}, calling {@link Enumerable.return} will clear the captured iterator,
     * if there is one. Subsequent calls to {@link Enumerable.next} will result in re-capturing the underlying iterable, and
     * yielding items from the beginning.
     * @param value Value to return.
     * @returns The value as an iterator result.
     */
    return(value) {
        this.#iterator = undefined;
        return { done: true, value };
    }
    /**
     * Determines whether an item in the collection exists that satisfies the specified predicate.
     * @param predicate Function used to search for an item.
     * @returns `true` when the item was found; otherwise `false`.
     */
    some(predicate) {
        for (const item of this) {
            if (predicate(item)) {
                return true;
            }
        }
        return false;
    }
    /**
     * Returns an iterator with the items, from 0, up to the specified limit.
     * @param limit Limit of items to take.
     * @returns An iterator of items from 0 to the limit.
     */
    take(limit) {
        if (isNaN(limit) || limit < 0) {
            throw new RangeError("limit must be 0, or a positive number");
        }
        return new Enumerable(function* () {
            let i = 0;
            for (const item of this) {
                if (i++ < limit) {
                    yield item;
                }
            }
        }.bind(this));
    }
    /**
     * Acts as if a `throw` statement is inserted in the generator's body at the current suspended position.
     * @param e Error to throw.
     */
    throw(e) {
        throw e;
    }
    /**
     * Converts this iterator to an array.
     * @returns The array of items from this iterator.
     */
    toArray() {
        return Array.from(this);
    }
    /**
     * Converts this iterator to serializable collection.
     * @returns The serializable collection of items.
     */
    toJSON() {
        return this.toArray();
    }
    /**
     * Converts this iterator to a string.
     * @returns The string.
     */
    toString() {
        return `${this.toArray()}`;
    }
}

// Polyfill, explicit resource management https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html#using-declarations-and-explicit-resource-management
// eslint-disable-next-line @typescript-eslint/no-explicit-any
Symbol.dispose ??= Symbol("Symbol.dispose");

/**
 * Provides a wrapper around a value that is lazily instantiated.
 */
class Lazy {
    /**
     * Private backing field for {@link Lazy.value}.
     */
    #value = undefined;
    /**
     * Factory responsible for instantiating the value.
     */
    #valueFactory;
    /**
     * Initializes a new instance of the {@link Lazy} class.
     * @param valueFactory The factory responsible for instantiating the value.
     */
    constructor(valueFactory) {
        this.#valueFactory = valueFactory;
    }
    /**
     * Gets the value.
     * @returns The value.
     */
    get value() {
        if (this.#value === undefined) {
            this.#value = this.#valueFactory();
        }
        return this.#value;
    }
}

/**
 * Returns an object that contains a promise and two functions to resolve or reject it.
 * @returns The promise, and the resolve and reject functions.
 */
function withResolvers() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

var bufferUtil$1 = {exports: {}};

const BINARY_TYPES$2 = ['nodebuffer', 'arraybuffer', 'fragments'];
const hasBlob$1 = typeof Blob !== 'undefined';

if (hasBlob$1) BINARY_TYPES$2.push('blob');

var constants = {
  BINARY_TYPES: BINARY_TYPES$2,
  CLOSE_TIMEOUT: 30000,
  EMPTY_BUFFER: Buffer.alloc(0),
  GUID: '258EAFA5-E914-47DA-95CA-C5AB0DC85B11',
  hasBlob: hasBlob$1,
  kForOnEventAttribute: Symbol('kIsForOnEventAttribute'),
  kListener: Symbol('kListener'),
  kStatusCode: Symbol('status-code'),
  kWebSocket: Symbol('websocket'),
  NOOP: () => {}
};

var unmask$1;
var mask;

const { EMPTY_BUFFER: EMPTY_BUFFER$3 } = constants;

const FastBuffer$2 = Buffer[Symbol.species];

/**
 * Merges an array of buffers into a new buffer.
 *
 * @param {Buffer[]} list The array of buffers to concat
 * @param {Number} totalLength The total length of buffers in the list
 * @return {Buffer} The resulting buffer
 * @public
 */
function concat$1(list, totalLength) {
  if (list.length === 0) return EMPTY_BUFFER$3;
  if (list.length === 1) return list[0];

  const target = Buffer.allocUnsafe(totalLength);
  let offset = 0;

  for (let i = 0; i < list.length; i++) {
    const buf = list[i];
    target.set(buf, offset);
    offset += buf.length;
  }

  if (offset < totalLength) {
    return new FastBuffer$2(target.buffer, target.byteOffset, offset);
  }

  return target;
}

/**
 * Masks a buffer using the given mask.
 *
 * @param {Buffer} source The buffer to mask
 * @param {Buffer} mask The mask to use
 * @param {Buffer} output The buffer where to store the result
 * @param {Number} offset The offset at which to start writing
 * @param {Number} length The number of bytes to mask.
 * @public
 */
function _mask(source, mask, output, offset, length) {
  for (let i = 0; i < length; i++) {
    output[offset + i] = source[i] ^ mask[i & 3];
  }
}

/**
 * Unmasks a buffer using the given mask.
 *
 * @param {Buffer} buffer The buffer to unmask
 * @param {Buffer} mask The mask to use
 * @public
 */
function _unmask(buffer, mask) {
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] ^= mask[i & 3];
  }
}

/**
 * Converts a buffer to an `ArrayBuffer`.
 *
 * @param {Buffer} buf The buffer to convert
 * @return {ArrayBuffer} Converted buffer
 * @public
 */
function toArrayBuffer$1(buf) {
  if (buf.length === buf.buffer.byteLength) {
    return buf.buffer;
  }

  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
}

/**
 * Converts `data` to a `Buffer`.
 *
 * @param {*} data The data to convert
 * @return {Buffer} The buffer
 * @throws {TypeError}
 * @public
 */
function toBuffer$2(data) {
  toBuffer$2.readOnly = true;

  if (Buffer.isBuffer(data)) return data;

  let buf;

  if (data instanceof ArrayBuffer) {
    buf = new FastBuffer$2(data);
  } else if (ArrayBuffer.isView(data)) {
    buf = new FastBuffer$2(data.buffer, data.byteOffset, data.byteLength);
  } else {
    buf = Buffer.from(data);
    toBuffer$2.readOnly = false;
  }

  return buf;
}

bufferUtil$1.exports = {
  concat: concat$1,
  mask: _mask,
  toArrayBuffer: toArrayBuffer$1,
  toBuffer: toBuffer$2,
  unmask: _unmask
};

/* istanbul ignore else  */
if (!process.env.WS_NO_BUFFER_UTIL) {
  try {
    const bufferUtil = require('bufferutil');

    mask = bufferUtil$1.exports.mask = function (source, mask, output, offset, length) {
      if (length < 48) _mask(source, mask, output, offset, length);
      else bufferUtil.mask(source, mask, output, offset, length);
    };

    unmask$1 = bufferUtil$1.exports.unmask = function (buffer, mask) {
      if (buffer.length < 32) _unmask(buffer, mask);
      else bufferUtil.unmask(buffer, mask);
    };
  } catch (e) {
    // Continue regardless of the error.
  }
}

var bufferUtilExports = bufferUtil$1.exports;

const kDone = Symbol('kDone');
const kRun = Symbol('kRun');

/**
 * A very simple job queue with adjustable concurrency. Adapted from
 * https://github.com/STRML/async-limiter
 */
let Limiter$1 = class Limiter {
  /**
   * Creates a new `Limiter`.
   *
   * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
   *     to run concurrently
   */
  constructor(concurrency) {
    this[kDone] = () => {
      this.pending--;
      this[kRun]();
    };
    this.concurrency = concurrency || Infinity;
    this.jobs = [];
    this.pending = 0;
  }

  /**
   * Adds a job to the queue.
   *
   * @param {Function} job The job to run
   * @public
   */
  add(job) {
    this.jobs.push(job);
    this[kRun]();
  }

  /**
   * Removes a job from the queue and runs it if possible.
   *
   * @private
   */
  [kRun]() {
    if (this.pending === this.concurrency) return;

    if (this.jobs.length) {
      const job = this.jobs.shift();

      this.pending++;
      job(this[kDone]);
    }
  }
};

var limiter = Limiter$1;

const zlib = require$$0;

const bufferUtil = bufferUtilExports;
const Limiter = limiter;
const { kStatusCode: kStatusCode$2 } = constants;

const FastBuffer$1 = Buffer[Symbol.species];
const TRAILER = Buffer.from([0x00, 0x00, 0xff, 0xff]);
const kPerMessageDeflate = Symbol('permessage-deflate');
const kTotalLength = Symbol('total-length');
const kCallback = Symbol('callback');
const kBuffers = Symbol('buffers');
const kError$1 = Symbol('error');

//
// We limit zlib concurrency, which prevents severe memory fragmentation
// as documented in https://github.com/nodejs/node/issues/8871#issuecomment-250915913
// and https://github.com/websockets/ws/issues/1202
//
// Intentionally global; it's the global thread pool that's an issue.
//
let zlibLimiter;

/**
 * permessage-deflate implementation.
 */
let PerMessageDeflate$3 = class PerMessageDeflate {
  /**
   * Creates a PerMessageDeflate instance.
   *
   * @param {Object} [options] Configuration options
   * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
   *     for, or request, a custom client window size
   * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
   *     acknowledge disabling of client context takeover
   * @param {Number} [options.concurrencyLimit=10] The number of concurrent
   *     calls to zlib
   * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
   *     use of a custom server window size
   * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
   *     disabling of server context takeover
   * @param {Number} [options.threshold=1024] Size (in bytes) below which
   *     messages should not be compressed if context takeover is disabled
   * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
   *     deflate
   * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
   *     inflate
   * @param {Boolean} [isServer=false] Create the instance in either server or
   *     client mode
   * @param {Number} [maxPayload=0] The maximum allowed message length
   */
  constructor(options, isServer, maxPayload) {
    this._maxPayload = maxPayload | 0;
    this._options = options || {};
    this._threshold =
      this._options.threshold !== undefined ? this._options.threshold : 1024;
    this._isServer = !!isServer;
    this._deflate = null;
    this._inflate = null;

    this.params = null;

    if (!zlibLimiter) {
      const concurrency =
        this._options.concurrencyLimit !== undefined
          ? this._options.concurrencyLimit
          : 10;
      zlibLimiter = new Limiter(concurrency);
    }
  }

  /**
   * @type {String}
   */
  static get extensionName() {
    return 'permessage-deflate';
  }

  /**
   * Create an extension negotiation offer.
   *
   * @return {Object} Extension parameters
   * @public
   */
  offer() {
    const params = {};

    if (this._options.serverNoContextTakeover) {
      params.server_no_context_takeover = true;
    }
    if (this._options.clientNoContextTakeover) {
      params.client_no_context_takeover = true;
    }
    if (this._options.serverMaxWindowBits) {
      params.server_max_window_bits = this._options.serverMaxWindowBits;
    }
    if (this._options.clientMaxWindowBits) {
      params.client_max_window_bits = this._options.clientMaxWindowBits;
    } else if (this._options.clientMaxWindowBits == null) {
      params.client_max_window_bits = true;
    }

    return params;
  }

  /**
   * Accept an extension negotiation offer/response.
   *
   * @param {Array} configurations The extension negotiation offers/reponse
   * @return {Object} Accepted configuration
   * @public
   */
  accept(configurations) {
    configurations = this.normalizeParams(configurations);

    this.params = this._isServer
      ? this.acceptAsServer(configurations)
      : this.acceptAsClient(configurations);

    return this.params;
  }

  /**
   * Releases all resources used by the extension.
   *
   * @public
   */
  cleanup() {
    if (this._inflate) {
      this._inflate.close();
      this._inflate = null;
    }

    if (this._deflate) {
      const callback = this._deflate[kCallback];

      this._deflate.close();
      this._deflate = null;

      if (callback) {
        callback(
          new Error(
            'The deflate stream was closed while data was being processed'
          )
        );
      }
    }
  }

  /**
   *  Accept an extension negotiation offer.
   *
   * @param {Array} offers The extension negotiation offers
   * @return {Object} Accepted configuration
   * @private
   */
  acceptAsServer(offers) {
    const opts = this._options;
    const accepted = offers.find((params) => {
      if (
        (opts.serverNoContextTakeover === false &&
          params.server_no_context_takeover) ||
        (params.server_max_window_bits &&
          (opts.serverMaxWindowBits === false ||
            (typeof opts.serverMaxWindowBits === 'number' &&
              opts.serverMaxWindowBits > params.server_max_window_bits))) ||
        (typeof opts.clientMaxWindowBits === 'number' &&
          !params.client_max_window_bits)
      ) {
        return false;
      }

      return true;
    });

    if (!accepted) {
      throw new Error('None of the extension offers can be accepted');
    }

    if (opts.serverNoContextTakeover) {
      accepted.server_no_context_takeover = true;
    }
    if (opts.clientNoContextTakeover) {
      accepted.client_no_context_takeover = true;
    }
    if (typeof opts.serverMaxWindowBits === 'number') {
      accepted.server_max_window_bits = opts.serverMaxWindowBits;
    }
    if (typeof opts.clientMaxWindowBits === 'number') {
      accepted.client_max_window_bits = opts.clientMaxWindowBits;
    } else if (
      accepted.client_max_window_bits === true ||
      opts.clientMaxWindowBits === false
    ) {
      delete accepted.client_max_window_bits;
    }

    return accepted;
  }

  /**
   * Accept the extension negotiation response.
   *
   * @param {Array} response The extension negotiation response
   * @return {Object} Accepted configuration
   * @private
   */
  acceptAsClient(response) {
    const params = response[0];

    if (
      this._options.clientNoContextTakeover === false &&
      params.client_no_context_takeover
    ) {
      throw new Error('Unexpected parameter "client_no_context_takeover"');
    }

    if (!params.client_max_window_bits) {
      if (typeof this._options.clientMaxWindowBits === 'number') {
        params.client_max_window_bits = this._options.clientMaxWindowBits;
      }
    } else if (
      this._options.clientMaxWindowBits === false ||
      (typeof this._options.clientMaxWindowBits === 'number' &&
        params.client_max_window_bits > this._options.clientMaxWindowBits)
    ) {
      throw new Error(
        'Unexpected or invalid parameter "client_max_window_bits"'
      );
    }

    return params;
  }

  /**
   * Normalize parameters.
   *
   * @param {Array} configurations The extension negotiation offers/reponse
   * @return {Array} The offers/response with normalized parameters
   * @private
   */
  normalizeParams(configurations) {
    configurations.forEach((params) => {
      Object.keys(params).forEach((key) => {
        let value = params[key];

        if (value.length > 1) {
          throw new Error(`Parameter "${key}" must have only a single value`);
        }

        value = value[0];

        if (key === 'client_max_window_bits') {
          if (value !== true) {
            const num = +value;
            if (!Number.isInteger(num) || num < 8 || num > 15) {
              throw new TypeError(
                `Invalid value for parameter "${key}": ${value}`
              );
            }
            value = num;
          } else if (!this._isServer) {
            throw new TypeError(
              `Invalid value for parameter "${key}": ${value}`
            );
          }
        } else if (key === 'server_max_window_bits') {
          const num = +value;
          if (!Number.isInteger(num) || num < 8 || num > 15) {
            throw new TypeError(
              `Invalid value for parameter "${key}": ${value}`
            );
          }
          value = num;
        } else if (
          key === 'client_no_context_takeover' ||
          key === 'server_no_context_takeover'
        ) {
          if (value !== true) {
            throw new TypeError(
              `Invalid value for parameter "${key}": ${value}`
            );
          }
        } else {
          throw new Error(`Unknown parameter "${key}"`);
        }

        params[key] = value;
      });
    });

    return configurations;
  }

  /**
   * Decompress data. Concurrency limited.
   *
   * @param {Buffer} data Compressed data
   * @param {Boolean} fin Specifies whether or not this is the last fragment
   * @param {Function} callback Callback
   * @public
   */
  decompress(data, fin, callback) {
    zlibLimiter.add((done) => {
      this._decompress(data, fin, (err, result) => {
        done();
        callback(err, result);
      });
    });
  }

  /**
   * Compress data. Concurrency limited.
   *
   * @param {(Buffer|String)} data Data to compress
   * @param {Boolean} fin Specifies whether or not this is the last fragment
   * @param {Function} callback Callback
   * @public
   */
  compress(data, fin, callback) {
    zlibLimiter.add((done) => {
      this._compress(data, fin, (err, result) => {
        done();
        callback(err, result);
      });
    });
  }

  /**
   * Decompress data.
   *
   * @param {Buffer} data Compressed data
   * @param {Boolean} fin Specifies whether or not this is the last fragment
   * @param {Function} callback Callback
   * @private
   */
  _decompress(data, fin, callback) {
    const endpoint = this._isServer ? 'client' : 'server';

    if (!this._inflate) {
      const key = `${endpoint}_max_window_bits`;
      const windowBits =
        typeof this.params[key] !== 'number'
          ? zlib.Z_DEFAULT_WINDOWBITS
          : this.params[key];

      this._inflate = zlib.createInflateRaw({
        ...this._options.zlibInflateOptions,
        windowBits
      });
      this._inflate[kPerMessageDeflate] = this;
      this._inflate[kTotalLength] = 0;
      this._inflate[kBuffers] = [];
      this._inflate.on('error', inflateOnError);
      this._inflate.on('data', inflateOnData);
    }

    this._inflate[kCallback] = callback;

    this._inflate.write(data);
    if (fin) this._inflate.write(TRAILER);

    this._inflate.flush(() => {
      const err = this._inflate[kError$1];

      if (err) {
        this._inflate.close();
        this._inflate = null;
        callback(err);
        return;
      }

      const data = bufferUtil.concat(
        this._inflate[kBuffers],
        this._inflate[kTotalLength]
      );

      if (this._inflate._readableState.endEmitted) {
        this._inflate.close();
        this._inflate = null;
      } else {
        this._inflate[kTotalLength] = 0;
        this._inflate[kBuffers] = [];

        if (fin && this.params[`${endpoint}_no_context_takeover`]) {
          this._inflate.reset();
        }
      }

      callback(null, data);
    });
  }

  /**
   * Compress data.
   *
   * @param {(Buffer|String)} data Data to compress
   * @param {Boolean} fin Specifies whether or not this is the last fragment
   * @param {Function} callback Callback
   * @private
   */
  _compress(data, fin, callback) {
    const endpoint = this._isServer ? 'server' : 'client';

    if (!this._deflate) {
      const key = `${endpoint}_max_window_bits`;
      const windowBits =
        typeof this.params[key] !== 'number'
          ? zlib.Z_DEFAULT_WINDOWBITS
          : this.params[key];

      this._deflate = zlib.createDeflateRaw({
        ...this._options.zlibDeflateOptions,
        windowBits
      });

      this._deflate[kTotalLength] = 0;
      this._deflate[kBuffers] = [];

      this._deflate.on('data', deflateOnData);
    }

    this._deflate[kCallback] = callback;

    this._deflate.write(data);
    this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
      if (!this._deflate) {
        //
        // The deflate stream was closed while data was being processed.
        //
        return;
      }

      let data = bufferUtil.concat(
        this._deflate[kBuffers],
        this._deflate[kTotalLength]
      );

      if (fin) {
        data = new FastBuffer$1(data.buffer, data.byteOffset, data.length - 4);
      }

      //
      // Ensure that the callback will not be called again in
      // `PerMessageDeflate#cleanup()`.
      //
      this._deflate[kCallback] = null;

      this._deflate[kTotalLength] = 0;
      this._deflate[kBuffers] = [];

      if (fin && this.params[`${endpoint}_no_context_takeover`]) {
        this._deflate.reset();
      }

      callback(null, data);
    });
  }
};

var permessageDeflate = PerMessageDeflate$3;

/**
 * The listener of the `zlib.DeflateRaw` stream `'data'` event.
 *
 * @param {Buffer} chunk A chunk of data
 * @private
 */
function deflateOnData(chunk) {
  this[kBuffers].push(chunk);
  this[kTotalLength] += chunk.length;
}

/**
 * The listener of the `zlib.InflateRaw` stream `'data'` event.
 *
 * @param {Buffer} chunk A chunk of data
 * @private
 */
function inflateOnData(chunk) {
  this[kTotalLength] += chunk.length;

  if (
    this[kPerMessageDeflate]._maxPayload < 1 ||
    this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload
  ) {
    this[kBuffers].push(chunk);
    return;
  }

  this[kError$1] = new RangeError('Max payload size exceeded');
  this[kError$1].code = 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH';
  this[kError$1][kStatusCode$2] = 1009;
  this.removeListener('data', inflateOnData);

  //
  // The choice to employ `zlib.reset()` over `zlib.close()` is dictated by the
  // fact that in Node.js versions prior to 13.10.0, the callback for
  // `zlib.flush()` is not called if `zlib.close()` is used. Utilizing
  // `zlib.reset()` ensures that either the callback is invoked or an error is
  // emitted.
  //
  this.reset();
}

/**
 * The listener of the `zlib.InflateRaw` stream `'error'` event.
 *
 * @param {Error} err The emitted error
 * @private
 */
function inflateOnError(err) {
  //
  // There is no need to call `Zlib#close()` as the handle is automatically
  // closed when an error is emitted.
  //
  this[kPerMessageDeflate]._inflate = null;

  if (this[kError$1]) {
    this[kCallback](this[kError$1]);
    return;
  }

  err[kStatusCode$2] = 1007;
  this[kCallback](err);
}

var validation = {exports: {}};

var isValidUTF8_1;

const { isUtf8 } = require$$0$1;

const { hasBlob } = constants;

//
// Allowed token characters:
//
// '!', '#', '$', '%', '&', ''', '*', '+', '-',
// '.', 0-9, A-Z, '^', '_', '`', a-z, '|', '~'
//
// tokenChars[32] === 0 // ' '
// tokenChars[33] === 1 // '!'
// tokenChars[34] === 0 // '"'
// ...
//
// prettier-ignore
const tokenChars$2 = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0 - 15
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 16 - 31
  0, 1, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 0, 1, 1, 0, // 32 - 47
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, // 48 - 63
  0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, // 64 - 79
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, // 80 - 95
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, // 96 - 111
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0 // 112 - 127
];

/**
 * Checks if a status code is allowed in a close frame.
 *
 * @param {Number} code The status code
 * @return {Boolean} `true` if the status code is valid, else `false`
 * @public
 */
function isValidStatusCode$2(code) {
  return (
    (code >= 1000 &&
      code <= 1014 &&
      code !== 1004 &&
      code !== 1005 &&
      code !== 1006) ||
    (code >= 3000 && code <= 4999)
  );
}

/**
 * Checks if a given buffer contains only correct UTF-8.
 * Ported from https://www.cl.cam.ac.uk/%7Emgk25/ucs/utf8_check.c by
 * Markus Kuhn.
 *
 * @param {Buffer} buf The buffer to check
 * @return {Boolean} `true` if `buf` contains only correct UTF-8, else `false`
 * @public
 */
function _isValidUTF8(buf) {
  const len = buf.length;
  let i = 0;

  while (i < len) {
    if ((buf[i] & 0x80) === 0) {
      // 0xxxxxxx
      i++;
    } else if ((buf[i] & 0xe0) === 0xc0) {
      // 110xxxxx 10xxxxxx
      if (
        i + 1 === len ||
        (buf[i + 1] & 0xc0) !== 0x80 ||
        (buf[i] & 0xfe) === 0xc0 // Overlong
      ) {
        return false;
      }

      i += 2;
    } else if ((buf[i] & 0xf0) === 0xe0) {
      // 1110xxxx 10xxxxxx 10xxxxxx
      if (
        i + 2 >= len ||
        (buf[i + 1] & 0xc0) !== 0x80 ||
        (buf[i + 2] & 0xc0) !== 0x80 ||
        (buf[i] === 0xe0 && (buf[i + 1] & 0xe0) === 0x80) || // Overlong
        (buf[i] === 0xed && (buf[i + 1] & 0xe0) === 0xa0) // Surrogate (U+D800 - U+DFFF)
      ) {
        return false;
      }

      i += 3;
    } else if ((buf[i] & 0xf8) === 0xf0) {
      // 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx
      if (
        i + 3 >= len ||
        (buf[i + 1] & 0xc0) !== 0x80 ||
        (buf[i + 2] & 0xc0) !== 0x80 ||
        (buf[i + 3] & 0xc0) !== 0x80 ||
        (buf[i] === 0xf0 && (buf[i + 1] & 0xf0) === 0x80) || // Overlong
        (buf[i] === 0xf4 && buf[i + 1] > 0x8f) ||
        buf[i] > 0xf4 // > U+10FFFF
      ) {
        return false;
      }

      i += 4;
    } else {
      return false;
    }
  }

  return true;
}

/**
 * Determines whether a value is a `Blob`.
 *
 * @param {*} value The value to be tested
 * @return {Boolean} `true` if `value` is a `Blob`, else `false`
 * @private
 */
function isBlob$2(value) {
  return (
    hasBlob &&
    typeof value === 'object' &&
    typeof value.arrayBuffer === 'function' &&
    typeof value.type === 'string' &&
    typeof value.stream === 'function' &&
    (value[Symbol.toStringTag] === 'Blob' ||
      value[Symbol.toStringTag] === 'File')
  );
}

validation.exports = {
  isBlob: isBlob$2,
  isValidStatusCode: isValidStatusCode$2,
  isValidUTF8: _isValidUTF8,
  tokenChars: tokenChars$2
};

if (isUtf8) {
  isValidUTF8_1 = validation.exports.isValidUTF8 = function (buf) {
    return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
  };
} /* istanbul ignore else  */ else if (!process.env.WS_NO_UTF_8_VALIDATE) {
  try {
    const isValidUTF8 = require('utf-8-validate');

    isValidUTF8_1 = validation.exports.isValidUTF8 = function (buf) {
      return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
    };
  } catch (e) {
    // Continue regardless of the error.
  }
}

var validationExports = validation.exports;

const { Writable } = require$$0$2;

const PerMessageDeflate$2 = permessageDeflate;
const {
  BINARY_TYPES: BINARY_TYPES$1,
  EMPTY_BUFFER: EMPTY_BUFFER$2,
  kStatusCode: kStatusCode$1,
  kWebSocket: kWebSocket$3
} = constants;
const { concat, toArrayBuffer, unmask } = bufferUtilExports;
const { isValidStatusCode: isValidStatusCode$1, isValidUTF8 } = validationExports;

const FastBuffer = Buffer[Symbol.species];

const GET_INFO = 0;
const GET_PAYLOAD_LENGTH_16 = 1;
const GET_PAYLOAD_LENGTH_64 = 2;
const GET_MASK = 3;
const GET_DATA = 4;
const INFLATING = 5;
const DEFER_EVENT = 6;

/**
 * HyBi Receiver implementation.
 *
 * @extends Writable
 */
let Receiver$1 = class Receiver extends Writable {
  /**
   * Creates a Receiver instance.
   *
   * @param {Object} [options] Options object
   * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
   *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
   *     multiple times in the same tick
   * @param {String} [options.binaryType=nodebuffer] The type for binary data
   * @param {Object} [options.extensions] An object containing the negotiated
   *     extensions
   * @param {Boolean} [options.isServer=false] Specifies whether to operate in
   *     client or server mode
   * @param {Number} [options.maxPayload=0] The maximum allowed message length
   * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
   *     not to skip UTF-8 validation for text and close messages
   */
  constructor(options = {}) {
    super();

    this._allowSynchronousEvents =
      options.allowSynchronousEvents !== undefined
        ? options.allowSynchronousEvents
        : true;
    this._binaryType = options.binaryType || BINARY_TYPES$1[0];
    this._extensions = options.extensions || {};
    this._isServer = !!options.isServer;
    this._maxPayload = options.maxPayload | 0;
    this._skipUTF8Validation = !!options.skipUTF8Validation;
    this[kWebSocket$3] = undefined;

    this._bufferedBytes = 0;
    this._buffers = [];

    this._compressed = false;
    this._payloadLength = 0;
    this._mask = undefined;
    this._fragmented = 0;
    this._masked = false;
    this._fin = false;
    this._opcode = 0;

    this._totalPayloadLength = 0;
    this._messageLength = 0;
    this._fragments = [];

    this._errored = false;
    this._loop = false;
    this._state = GET_INFO;
  }

  /**
   * Implements `Writable.prototype._write()`.
   *
   * @param {Buffer} chunk The chunk of data to write
   * @param {String} encoding The character encoding of `chunk`
   * @param {Function} cb Callback
   * @private
   */
  _write(chunk, encoding, cb) {
    if (this._opcode === 0x08 && this._state == GET_INFO) return cb();

    this._bufferedBytes += chunk.length;
    this._buffers.push(chunk);
    this.startLoop(cb);
  }

  /**
   * Consumes `n` bytes from the buffered data.
   *
   * @param {Number} n The number of bytes to consume
   * @return {Buffer} The consumed bytes
   * @private
   */
  consume(n) {
    this._bufferedBytes -= n;

    if (n === this._buffers[0].length) return this._buffers.shift();

    if (n < this._buffers[0].length) {
      const buf = this._buffers[0];
      this._buffers[0] = new FastBuffer(
        buf.buffer,
        buf.byteOffset + n,
        buf.length - n
      );

      return new FastBuffer(buf.buffer, buf.byteOffset, n);
    }

    const dst = Buffer.allocUnsafe(n);

    do {
      const buf = this._buffers[0];
      const offset = dst.length - n;

      if (n >= buf.length) {
        dst.set(this._buffers.shift(), offset);
      } else {
        dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
        this._buffers[0] = new FastBuffer(
          buf.buffer,
          buf.byteOffset + n,
          buf.length - n
        );
      }

      n -= buf.length;
    } while (n > 0);

    return dst;
  }

  /**
   * Starts the parsing loop.
   *
   * @param {Function} cb Callback
   * @private
   */
  startLoop(cb) {
    this._loop = true;

    do {
      switch (this._state) {
        case GET_INFO:
          this.getInfo(cb);
          break;
        case GET_PAYLOAD_LENGTH_16:
          this.getPayloadLength16(cb);
          break;
        case GET_PAYLOAD_LENGTH_64:
          this.getPayloadLength64(cb);
          break;
        case GET_MASK:
          this.getMask();
          break;
        case GET_DATA:
          this.getData(cb);
          break;
        case INFLATING:
        case DEFER_EVENT:
          this._loop = false;
          return;
      }
    } while (this._loop);

    if (!this._errored) cb();
  }

  /**
   * Reads the first two bytes of a frame.
   *
   * @param {Function} cb Callback
   * @private
   */
  getInfo(cb) {
    if (this._bufferedBytes < 2) {
      this._loop = false;
      return;
    }

    const buf = this.consume(2);

    if ((buf[0] & 0x30) !== 0x00) {
      const error = this.createError(
        RangeError,
        'RSV2 and RSV3 must be clear',
        true,
        1002,
        'WS_ERR_UNEXPECTED_RSV_2_3'
      );

      cb(error);
      return;
    }

    const compressed = (buf[0] & 0x40) === 0x40;

    if (compressed && !this._extensions[PerMessageDeflate$2.extensionName]) {
      const error = this.createError(
        RangeError,
        'RSV1 must be clear',
        true,
        1002,
        'WS_ERR_UNEXPECTED_RSV_1'
      );

      cb(error);
      return;
    }

    this._fin = (buf[0] & 0x80) === 0x80;
    this._opcode = buf[0] & 0x0f;
    this._payloadLength = buf[1] & 0x7f;

    if (this._opcode === 0x00) {
      if (compressed) {
        const error = this.createError(
          RangeError,
          'RSV1 must be clear',
          true,
          1002,
          'WS_ERR_UNEXPECTED_RSV_1'
        );

        cb(error);
        return;
      }

      if (!this._fragmented) {
        const error = this.createError(
          RangeError,
          'invalid opcode 0',
          true,
          1002,
          'WS_ERR_INVALID_OPCODE'
        );

        cb(error);
        return;
      }

      this._opcode = this._fragmented;
    } else if (this._opcode === 0x01 || this._opcode === 0x02) {
      if (this._fragmented) {
        const error = this.createError(
          RangeError,
          `invalid opcode ${this._opcode}`,
          true,
          1002,
          'WS_ERR_INVALID_OPCODE'
        );

        cb(error);
        return;
      }

      this._compressed = compressed;
    } else if (this._opcode > 0x07 && this._opcode < 0x0b) {
      if (!this._fin) {
        const error = this.createError(
          RangeError,
          'FIN must be set',
          true,
          1002,
          'WS_ERR_EXPECTED_FIN'
        );

        cb(error);
        return;
      }

      if (compressed) {
        const error = this.createError(
          RangeError,
          'RSV1 must be clear',
          true,
          1002,
          'WS_ERR_UNEXPECTED_RSV_1'
        );

        cb(error);
        return;
      }

      if (
        this._payloadLength > 0x7d ||
        (this._opcode === 0x08 && this._payloadLength === 1)
      ) {
        const error = this.createError(
          RangeError,
          `invalid payload length ${this._payloadLength}`,
          true,
          1002,
          'WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH'
        );

        cb(error);
        return;
      }
    } else {
      const error = this.createError(
        RangeError,
        `invalid opcode ${this._opcode}`,
        true,
        1002,
        'WS_ERR_INVALID_OPCODE'
      );

      cb(error);
      return;
    }

    if (!this._fin && !this._fragmented) this._fragmented = this._opcode;
    this._masked = (buf[1] & 0x80) === 0x80;

    if (this._isServer) {
      if (!this._masked) {
        const error = this.createError(
          RangeError,
          'MASK must be set',
          true,
          1002,
          'WS_ERR_EXPECTED_MASK'
        );

        cb(error);
        return;
      }
    } else if (this._masked) {
      const error = this.createError(
        RangeError,
        'MASK must be clear',
        true,
        1002,
        'WS_ERR_UNEXPECTED_MASK'
      );

      cb(error);
      return;
    }

    if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
    else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
    else this.haveLength(cb);
  }

  /**
   * Gets extended payload length (7+16).
   *
   * @param {Function} cb Callback
   * @private
   */
  getPayloadLength16(cb) {
    if (this._bufferedBytes < 2) {
      this._loop = false;
      return;
    }

    this._payloadLength = this.consume(2).readUInt16BE(0);
    this.haveLength(cb);
  }

  /**
   * Gets extended payload length (7+64).
   *
   * @param {Function} cb Callback
   * @private
   */
  getPayloadLength64(cb) {
    if (this._bufferedBytes < 8) {
      this._loop = false;
      return;
    }

    const buf = this.consume(8);
    const num = buf.readUInt32BE(0);

    //
    // The maximum safe integer in JavaScript is 2^53 - 1. An error is returned
    // if payload length is greater than this number.
    //
    if (num > Math.pow(2, 53 - 32) - 1) {
      const error = this.createError(
        RangeError,
        'Unsupported WebSocket frame: payload length > 2^53 - 1',
        false,
        1009,
        'WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH'
      );

      cb(error);
      return;
    }

    this._payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4);
    this.haveLength(cb);
  }

  /**
   * Payload length has been read.
   *
   * @param {Function} cb Callback
   * @private
   */
  haveLength(cb) {
    if (this._payloadLength && this._opcode < 0x08) {
      this._totalPayloadLength += this._payloadLength;
      if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
        const error = this.createError(
          RangeError,
          'Max payload size exceeded',
          false,
          1009,
          'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH'
        );

        cb(error);
        return;
      }
    }

    if (this._masked) this._state = GET_MASK;
    else this._state = GET_DATA;
  }

  /**
   * Reads mask bytes.
   *
   * @private
   */
  getMask() {
    if (this._bufferedBytes < 4) {
      this._loop = false;
      return;
    }

    this._mask = this.consume(4);
    this._state = GET_DATA;
  }

  /**
   * Reads data bytes.
   *
   * @param {Function} cb Callback
   * @private
   */
  getData(cb) {
    let data = EMPTY_BUFFER$2;

    if (this._payloadLength) {
      if (this._bufferedBytes < this._payloadLength) {
        this._loop = false;
        return;
      }

      data = this.consume(this._payloadLength);

      if (
        this._masked &&
        (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0
      ) {
        unmask(data, this._mask);
      }
    }

    if (this._opcode > 0x07) {
      this.controlMessage(data, cb);
      return;
    }

    if (this._compressed) {
      this._state = INFLATING;
      this.decompress(data, cb);
      return;
    }

    if (data.length) {
      //
      // This message is not compressed so its length is the sum of the payload
      // length of all fragments.
      //
      this._messageLength = this._totalPayloadLength;
      this._fragments.push(data);
    }

    this.dataMessage(cb);
  }

  /**
   * Decompresses data.
   *
   * @param {Buffer} data Compressed data
   * @param {Function} cb Callback
   * @private
   */
  decompress(data, cb) {
    const perMessageDeflate = this._extensions[PerMessageDeflate$2.extensionName];

    perMessageDeflate.decompress(data, this._fin, (err, buf) => {
      if (err) return cb(err);

      if (buf.length) {
        this._messageLength += buf.length;
        if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
          const error = this.createError(
            RangeError,
            'Max payload size exceeded',
            false,
            1009,
            'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH'
          );

          cb(error);
          return;
        }

        this._fragments.push(buf);
      }

      this.dataMessage(cb);
      if (this._state === GET_INFO) this.startLoop(cb);
    });
  }

  /**
   * Handles a data message.
   *
   * @param {Function} cb Callback
   * @private
   */
  dataMessage(cb) {
    if (!this._fin) {
      this._state = GET_INFO;
      return;
    }

    const messageLength = this._messageLength;
    const fragments = this._fragments;

    this._totalPayloadLength = 0;
    this._messageLength = 0;
    this._fragmented = 0;
    this._fragments = [];

    if (this._opcode === 2) {
      let data;

      if (this._binaryType === 'nodebuffer') {
        data = concat(fragments, messageLength);
      } else if (this._binaryType === 'arraybuffer') {
        data = toArrayBuffer(concat(fragments, messageLength));
      } else if (this._binaryType === 'blob') {
        data = new Blob(fragments);
      } else {
        data = fragments;
      }

      if (this._allowSynchronousEvents) {
        this.emit('message', data, true);
        this._state = GET_INFO;
      } else {
        this._state = DEFER_EVENT;
        setImmediate(() => {
          this.emit('message', data, true);
          this._state = GET_INFO;
          this.startLoop(cb);
        });
      }
    } else {
      const buf = concat(fragments, messageLength);

      if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
        const error = this.createError(
          Error,
          'invalid UTF-8 sequence',
          true,
          1007,
          'WS_ERR_INVALID_UTF8'
        );

        cb(error);
        return;
      }

      if (this._state === INFLATING || this._allowSynchronousEvents) {
        this.emit('message', buf, false);
        this._state = GET_INFO;
      } else {
        this._state = DEFER_EVENT;
        setImmediate(() => {
          this.emit('message', buf, false);
          this._state = GET_INFO;
          this.startLoop(cb);
        });
      }
    }
  }

  /**
   * Handles a control message.
   *
   * @param {Buffer} data Data to handle
   * @return {(Error|RangeError|undefined)} A possible error
   * @private
   */
  controlMessage(data, cb) {
    if (this._opcode === 0x08) {
      if (data.length === 0) {
        this._loop = false;
        this.emit('conclude', 1005, EMPTY_BUFFER$2);
        this.end();
      } else {
        const code = data.readUInt16BE(0);

        if (!isValidStatusCode$1(code)) {
          const error = this.createError(
            RangeError,
            `invalid status code ${code}`,
            true,
            1002,
            'WS_ERR_INVALID_CLOSE_CODE'
          );

          cb(error);
          return;
        }

        const buf = new FastBuffer(
          data.buffer,
          data.byteOffset + 2,
          data.length - 2
        );

        if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
          const error = this.createError(
            Error,
            'invalid UTF-8 sequence',
            true,
            1007,
            'WS_ERR_INVALID_UTF8'
          );

          cb(error);
          return;
        }

        this._loop = false;
        this.emit('conclude', code, buf);
        this.end();
      }

      this._state = GET_INFO;
      return;
    }

    if (this._allowSynchronousEvents) {
      this.emit(this._opcode === 0x09 ? 'ping' : 'pong', data);
      this._state = GET_INFO;
    } else {
      this._state = DEFER_EVENT;
      setImmediate(() => {
        this.emit(this._opcode === 0x09 ? 'ping' : 'pong', data);
        this._state = GET_INFO;
        this.startLoop(cb);
      });
    }
  }

  /**
   * Builds an error object.
   *
   * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
   * @param {String} message The error message
   * @param {Boolean} prefix Specifies whether or not to add a default prefix to
   *     `message`
   * @param {Number} statusCode The status code
   * @param {String} errorCode The exposed error code
   * @return {(Error|RangeError)} The error
   * @private
   */
  createError(ErrorCtor, message, prefix, statusCode, errorCode) {
    this._loop = false;
    this._errored = true;

    const err = new ErrorCtor(
      prefix ? `Invalid WebSocket frame: ${message}` : message
    );

    Error.captureStackTrace(err, this.createError);
    err.code = errorCode;
    err[kStatusCode$1] = statusCode;
    return err;
  }
};

var receiver = Receiver$1;

/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "^Duplex" }] */

const { Duplex: Duplex$3 } = require$$0$2;
const { randomFillSync } = require$$1;

const PerMessageDeflate$1 = permessageDeflate;
const { EMPTY_BUFFER: EMPTY_BUFFER$1, kWebSocket: kWebSocket$2, NOOP: NOOP$1 } = constants;
const { isBlob: isBlob$1, isValidStatusCode } = validationExports;
const { mask: applyMask, toBuffer: toBuffer$1 } = bufferUtilExports;

const kByteLength = Symbol('kByteLength');
const maskBuffer = Buffer.alloc(4);
const RANDOM_POOL_SIZE = 8 * 1024;
let randomPool;
let randomPoolPointer = RANDOM_POOL_SIZE;

const DEFAULT = 0;
const DEFLATING = 1;
const GET_BLOB_DATA = 2;

/**
 * HyBi Sender implementation.
 */
let Sender$1 = class Sender {
  /**
   * Creates a Sender instance.
   *
   * @param {Duplex} socket The connection socket
   * @param {Object} [extensions] An object containing the negotiated extensions
   * @param {Function} [generateMask] The function used to generate the masking
   *     key
   */
  constructor(socket, extensions, generateMask) {
    this._extensions = extensions || {};

    if (generateMask) {
      this._generateMask = generateMask;
      this._maskBuffer = Buffer.alloc(4);
    }

    this._socket = socket;

    this._firstFragment = true;
    this._compress = false;

    this._bufferedBytes = 0;
    this._queue = [];
    this._state = DEFAULT;
    this.onerror = NOOP$1;
    this[kWebSocket$2] = undefined;
  }

  /**
   * Frames a piece of data according to the HyBi WebSocket protocol.
   *
   * @param {(Buffer|String)} data The data to frame
   * @param {Object} options Options object
   * @param {Boolean} [options.fin=false] Specifies whether or not to set the
   *     FIN bit
   * @param {Function} [options.generateMask] The function used to generate the
   *     masking key
   * @param {Boolean} [options.mask=false] Specifies whether or not to mask
   *     `data`
   * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
   *     key
   * @param {Number} options.opcode The opcode
   * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
   *     modified
   * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
   *     RSV1 bit
   * @return {(Buffer|String)[]} The framed data
   * @public
   */
  static frame(data, options) {
    let mask;
    let merge = false;
    let offset = 2;
    let skipMasking = false;

    if (options.mask) {
      mask = options.maskBuffer || maskBuffer;

      if (options.generateMask) {
        options.generateMask(mask);
      } else {
        if (randomPoolPointer === RANDOM_POOL_SIZE) {
          /* istanbul ignore else  */
          if (randomPool === undefined) {
            //
            // This is lazily initialized because server-sent frames must not
            // be masked so it may never be used.
            //
            randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
          }

          randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
          randomPoolPointer = 0;
        }

        mask[0] = randomPool[randomPoolPointer++];
        mask[1] = randomPool[randomPoolPointer++];
        mask[2] = randomPool[randomPoolPointer++];
        mask[3] = randomPool[randomPoolPointer++];
      }

      skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
      offset = 6;
    }

    let dataLength;

    if (typeof data === 'string') {
      if (
        (!options.mask || skipMasking) &&
        options[kByteLength] !== undefined
      ) {
        dataLength = options[kByteLength];
      } else {
        data = Buffer.from(data);
        dataLength = data.length;
      }
    } else {
      dataLength = data.length;
      merge = options.mask && options.readOnly && !skipMasking;
    }

    let payloadLength = dataLength;

    if (dataLength >= 65536) {
      offset += 8;
      payloadLength = 127;
    } else if (dataLength > 125) {
      offset += 2;
      payloadLength = 126;
    }

    const target = Buffer.allocUnsafe(merge ? dataLength + offset : offset);

    target[0] = options.fin ? options.opcode | 0x80 : options.opcode;
    if (options.rsv1) target[0] |= 0x40;

    target[1] = payloadLength;

    if (payloadLength === 126) {
      target.writeUInt16BE(dataLength, 2);
    } else if (payloadLength === 127) {
      target[2] = target[3] = 0;
      target.writeUIntBE(dataLength, 4, 6);
    }

    if (!options.mask) return [target, data];

    target[1] |= 0x80;
    target[offset - 4] = mask[0];
    target[offset - 3] = mask[1];
    target[offset - 2] = mask[2];
    target[offset - 1] = mask[3];

    if (skipMasking) return [target, data];

    if (merge) {
      applyMask(data, mask, target, offset, dataLength);
      return [target];
    }

    applyMask(data, mask, data, 0, dataLength);
    return [target, data];
  }

  /**
   * Sends a close message to the other peer.
   *
   * @param {Number} [code] The status code component of the body
   * @param {(String|Buffer)} [data] The message component of the body
   * @param {Boolean} [mask=false] Specifies whether or not to mask the message
   * @param {Function} [cb] Callback
   * @public
   */
  close(code, data, mask, cb) {
    let buf;

    if (code === undefined) {
      buf = EMPTY_BUFFER$1;
    } else if (typeof code !== 'number' || !isValidStatusCode(code)) {
      throw new TypeError('First argument must be a valid error code number');
    } else if (data === undefined || !data.length) {
      buf = Buffer.allocUnsafe(2);
      buf.writeUInt16BE(code, 0);
    } else {
      const length = Buffer.byteLength(data);

      if (length > 123) {
        throw new RangeError('The message must not be greater than 123 bytes');
      }

      buf = Buffer.allocUnsafe(2 + length);
      buf.writeUInt16BE(code, 0);

      if (typeof data === 'string') {
        buf.write(data, 2);
      } else {
        buf.set(data, 2);
      }
    }

    const options = {
      [kByteLength]: buf.length,
      fin: true,
      generateMask: this._generateMask,
      mask,
      maskBuffer: this._maskBuffer,
      opcode: 0x08,
      readOnly: false,
      rsv1: false
    };

    if (this._state !== DEFAULT) {
      this.enqueue([this.dispatch, buf, false, options, cb]);
    } else {
      this.sendFrame(Sender.frame(buf, options), cb);
    }
  }

  /**
   * Sends a ping message to the other peer.
   *
   * @param {*} data The message to send
   * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
   * @param {Function} [cb] Callback
   * @public
   */
  ping(data, mask, cb) {
    let byteLength;
    let readOnly;

    if (typeof data === 'string') {
      byteLength = Buffer.byteLength(data);
      readOnly = false;
    } else if (isBlob$1(data)) {
      byteLength = data.size;
      readOnly = false;
    } else {
      data = toBuffer$1(data);
      byteLength = data.length;
      readOnly = toBuffer$1.readOnly;
    }

    if (byteLength > 125) {
      throw new RangeError('The data size must not be greater than 125 bytes');
    }

    const options = {
      [kByteLength]: byteLength,
      fin: true,
      generateMask: this._generateMask,
      mask,
      maskBuffer: this._maskBuffer,
      opcode: 0x09,
      readOnly,
      rsv1: false
    };

    if (isBlob$1(data)) {
      if (this._state !== DEFAULT) {
        this.enqueue([this.getBlobData, data, false, options, cb]);
      } else {
        this.getBlobData(data, false, options, cb);
      }
    } else if (this._state !== DEFAULT) {
      this.enqueue([this.dispatch, data, false, options, cb]);
    } else {
      this.sendFrame(Sender.frame(data, options), cb);
    }
  }

  /**
   * Sends a pong message to the other peer.
   *
   * @param {*} data The message to send
   * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
   * @param {Function} [cb] Callback
   * @public
   */
  pong(data, mask, cb) {
    let byteLength;
    let readOnly;

    if (typeof data === 'string') {
      byteLength = Buffer.byteLength(data);
      readOnly = false;
    } else if (isBlob$1(data)) {
      byteLength = data.size;
      readOnly = false;
    } else {
      data = toBuffer$1(data);
      byteLength = data.length;
      readOnly = toBuffer$1.readOnly;
    }

    if (byteLength > 125) {
      throw new RangeError('The data size must not be greater than 125 bytes');
    }

    const options = {
      [kByteLength]: byteLength,
      fin: true,
      generateMask: this._generateMask,
      mask,
      maskBuffer: this._maskBuffer,
      opcode: 0x0a,
      readOnly,
      rsv1: false
    };

    if (isBlob$1(data)) {
      if (this._state !== DEFAULT) {
        this.enqueue([this.getBlobData, data, false, options, cb]);
      } else {
        this.getBlobData(data, false, options, cb);
      }
    } else if (this._state !== DEFAULT) {
      this.enqueue([this.dispatch, data, false, options, cb]);
    } else {
      this.sendFrame(Sender.frame(data, options), cb);
    }
  }

  /**
   * Sends a data message to the other peer.
   *
   * @param {*} data The message to send
   * @param {Object} options Options object
   * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
   *     or text
   * @param {Boolean} [options.compress=false] Specifies whether or not to
   *     compress `data`
   * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
   *     last one
   * @param {Boolean} [options.mask=false] Specifies whether or not to mask
   *     `data`
   * @param {Function} [cb] Callback
   * @public
   */
  send(data, options, cb) {
    const perMessageDeflate = this._extensions[PerMessageDeflate$1.extensionName];
    let opcode = options.binary ? 2 : 1;
    let rsv1 = options.compress;

    let byteLength;
    let readOnly;

    if (typeof data === 'string') {
      byteLength = Buffer.byteLength(data);
      readOnly = false;
    } else if (isBlob$1(data)) {
      byteLength = data.size;
      readOnly = false;
    } else {
      data = toBuffer$1(data);
      byteLength = data.length;
      readOnly = toBuffer$1.readOnly;
    }

    if (this._firstFragment) {
      this._firstFragment = false;
      if (
        rsv1 &&
        perMessageDeflate &&
        perMessageDeflate.params[
          perMessageDeflate._isServer
            ? 'server_no_context_takeover'
            : 'client_no_context_takeover'
        ]
      ) {
        rsv1 = byteLength >= perMessageDeflate._threshold;
      }
      this._compress = rsv1;
    } else {
      rsv1 = false;
      opcode = 0;
    }

    if (options.fin) this._firstFragment = true;

    const opts = {
      [kByteLength]: byteLength,
      fin: options.fin,
      generateMask: this._generateMask,
      mask: options.mask,
      maskBuffer: this._maskBuffer,
      opcode,
      readOnly,
      rsv1
    };

    if (isBlob$1(data)) {
      if (this._state !== DEFAULT) {
        this.enqueue([this.getBlobData, data, this._compress, opts, cb]);
      } else {
        this.getBlobData(data, this._compress, opts, cb);
      }
    } else if (this._state !== DEFAULT) {
      this.enqueue([this.dispatch, data, this._compress, opts, cb]);
    } else {
      this.dispatch(data, this._compress, opts, cb);
    }
  }

  /**
   * Gets the contents of a blob as binary data.
   *
   * @param {Blob} blob The blob
   * @param {Boolean} [compress=false] Specifies whether or not to compress
   *     the data
   * @param {Object} options Options object
   * @param {Boolean} [options.fin=false] Specifies whether or not to set the
   *     FIN bit
   * @param {Function} [options.generateMask] The function used to generate the
   *     masking key
   * @param {Boolean} [options.mask=false] Specifies whether or not to mask
   *     `data`
   * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
   *     key
   * @param {Number} options.opcode The opcode
   * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
   *     modified
   * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
   *     RSV1 bit
   * @param {Function} [cb] Callback
   * @private
   */
  getBlobData(blob, compress, options, cb) {
    this._bufferedBytes += options[kByteLength];
    this._state = GET_BLOB_DATA;

    blob
      .arrayBuffer()
      .then((arrayBuffer) => {
        if (this._socket.destroyed) {
          const err = new Error(
            'The socket was closed while the blob was being read'
          );

          //
          // `callCallbacks` is called in the next tick to ensure that errors
          // that might be thrown in the callbacks behave like errors thrown
          // outside the promise chain.
          //
          process.nextTick(callCallbacks, this, err, cb);
          return;
        }

        this._bufferedBytes -= options[kByteLength];
        const data = toBuffer$1(arrayBuffer);

        if (!compress) {
          this._state = DEFAULT;
          this.sendFrame(Sender.frame(data, options), cb);
          this.dequeue();
        } else {
          this.dispatch(data, compress, options, cb);
        }
      })
      .catch((err) => {
        //
        // `onError` is called in the next tick for the same reason that
        // `callCallbacks` above is.
        //
        process.nextTick(onError, this, err, cb);
      });
  }

  /**
   * Dispatches a message.
   *
   * @param {(Buffer|String)} data The message to send
   * @param {Boolean} [compress=false] Specifies whether or not to compress
   *     `data`
   * @param {Object} options Options object
   * @param {Boolean} [options.fin=false] Specifies whether or not to set the
   *     FIN bit
   * @param {Function} [options.generateMask] The function used to generate the
   *     masking key
   * @param {Boolean} [options.mask=false] Specifies whether or not to mask
   *     `data`
   * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
   *     key
   * @param {Number} options.opcode The opcode
   * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
   *     modified
   * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
   *     RSV1 bit
   * @param {Function} [cb] Callback
   * @private
   */
  dispatch(data, compress, options, cb) {
    if (!compress) {
      this.sendFrame(Sender.frame(data, options), cb);
      return;
    }

    const perMessageDeflate = this._extensions[PerMessageDeflate$1.extensionName];

    this._bufferedBytes += options[kByteLength];
    this._state = DEFLATING;
    perMessageDeflate.compress(data, options.fin, (_, buf) => {
      if (this._socket.destroyed) {
        const err = new Error(
          'The socket was closed while data was being compressed'
        );

        callCallbacks(this, err, cb);
        return;
      }

      this._bufferedBytes -= options[kByteLength];
      this._state = DEFAULT;
      options.readOnly = false;
      this.sendFrame(Sender.frame(buf, options), cb);
      this.dequeue();
    });
  }

  /**
   * Executes queued send operations.
   *
   * @private
   */
  dequeue() {
    while (this._state === DEFAULT && this._queue.length) {
      const params = this._queue.shift();

      this._bufferedBytes -= params[3][kByteLength];
      Reflect.apply(params[0], this, params.slice(1));
    }
  }

  /**
   * Enqueues a send operation.
   *
   * @param {Array} params Send operation parameters.
   * @private
   */
  enqueue(params) {
    this._bufferedBytes += params[3][kByteLength];
    this._queue.push(params);
  }

  /**
   * Sends a frame.
   *
   * @param {(Buffer | String)[]} list The frame to send
   * @param {Function} [cb] Callback
   * @private
   */
  sendFrame(list, cb) {
    if (list.length === 2) {
      this._socket.cork();
      this._socket.write(list[0]);
      this._socket.write(list[1], cb);
      this._socket.uncork();
    } else {
      this._socket.write(list[0], cb);
    }
  }
};

var sender = Sender$1;

/**
 * Calls queued callbacks with an error.
 *
 * @param {Sender} sender The `Sender` instance
 * @param {Error} err The error to call the callbacks with
 * @param {Function} [cb] The first callback
 * @private
 */
function callCallbacks(sender, err, cb) {
  if (typeof cb === 'function') cb(err);

  for (let i = 0; i < sender._queue.length; i++) {
    const params = sender._queue[i];
    const callback = params[params.length - 1];

    if (typeof callback === 'function') callback(err);
  }
}

/**
 * Handles a `Sender` error.
 *
 * @param {Sender} sender The `Sender` instance
 * @param {Error} err The error
 * @param {Function} [cb] The first pending callback
 * @private
 */
function onError(sender, err, cb) {
  callCallbacks(sender, err, cb);
  sender.onerror(err);
}

const { kForOnEventAttribute: kForOnEventAttribute$1, kListener: kListener$1 } = constants;

const kCode = Symbol('kCode');
const kData = Symbol('kData');
const kError = Symbol('kError');
const kMessage = Symbol('kMessage');
const kReason = Symbol('kReason');
const kTarget = Symbol('kTarget');
const kType = Symbol('kType');
const kWasClean = Symbol('kWasClean');

/**
 * Class representing an event.
 */
let Event$1 = class Event {
  /**
   * Create a new `Event`.
   *
   * @param {String} type The name of the event
   * @throws {TypeError} If the `type` argument is not specified
   */
  constructor(type) {
    this[kTarget] = null;
    this[kType] = type;
  }

  /**
   * @type {*}
   */
  get target() {
    return this[kTarget];
  }

  /**
   * @type {String}
   */
  get type() {
    return this[kType];
  }
};

Object.defineProperty(Event$1.prototype, 'target', { enumerable: true });
Object.defineProperty(Event$1.prototype, 'type', { enumerable: true });

/**
 * Class representing a close event.
 *
 * @extends Event
 */
class CloseEvent extends Event$1 {
  /**
   * Create a new `CloseEvent`.
   *
   * @param {String} type The name of the event
   * @param {Object} [options] A dictionary object that allows for setting
   *     attributes via object members of the same name
   * @param {Number} [options.code=0] The status code explaining why the
   *     connection was closed
   * @param {String} [options.reason=''] A human-readable string explaining why
   *     the connection was closed
   * @param {Boolean} [options.wasClean=false] Indicates whether or not the
   *     connection was cleanly closed
   */
  constructor(type, options = {}) {
    super(type);

    this[kCode] = options.code === undefined ? 0 : options.code;
    this[kReason] = options.reason === undefined ? '' : options.reason;
    this[kWasClean] = options.wasClean === undefined ? false : options.wasClean;
  }

  /**
   * @type {Number}
   */
  get code() {
    return this[kCode];
  }

  /**
   * @type {String}
   */
  get reason() {
    return this[kReason];
  }

  /**
   * @type {Boolean}
   */
  get wasClean() {
    return this[kWasClean];
  }
}

Object.defineProperty(CloseEvent.prototype, 'code', { enumerable: true });
Object.defineProperty(CloseEvent.prototype, 'reason', { enumerable: true });
Object.defineProperty(CloseEvent.prototype, 'wasClean', { enumerable: true });

/**
 * Class representing an error event.
 *
 * @extends Event
 */
class ErrorEvent extends Event$1 {
  /**
   * Create a new `ErrorEvent`.
   *
   * @param {String} type The name of the event
   * @param {Object} [options] A dictionary object that allows for setting
   *     attributes via object members of the same name
   * @param {*} [options.error=null] The error that generated this event
   * @param {String} [options.message=''] The error message
   */
  constructor(type, options = {}) {
    super(type);

    this[kError] = options.error === undefined ? null : options.error;
    this[kMessage] = options.message === undefined ? '' : options.message;
  }

  /**
   * @type {*}
   */
  get error() {
    return this[kError];
  }

  /**
   * @type {String}
   */
  get message() {
    return this[kMessage];
  }
}

Object.defineProperty(ErrorEvent.prototype, 'error', { enumerable: true });
Object.defineProperty(ErrorEvent.prototype, 'message', { enumerable: true });

/**
 * Class representing a message event.
 *
 * @extends Event
 */
class MessageEvent extends Event$1 {
  /**
   * Create a new `MessageEvent`.
   *
   * @param {String} type The name of the event
   * @param {Object} [options] A dictionary object that allows for setting
   *     attributes via object members of the same name
   * @param {*} [options.data=null] The message content
   */
  constructor(type, options = {}) {
    super(type);

    this[kData] = options.data === undefined ? null : options.data;
  }

  /**
   * @type {*}
   */
  get data() {
    return this[kData];
  }
}

Object.defineProperty(MessageEvent.prototype, 'data', { enumerable: true });

/**
 * This provides methods for emulating the `EventTarget` interface. It's not
 * meant to be used directly.
 *
 * @mixin
 */
const EventTarget = {
  /**
   * Register an event listener.
   *
   * @param {String} type A string representing the event type to listen for
   * @param {(Function|Object)} handler The listener to add
   * @param {Object} [options] An options object specifies characteristics about
   *     the event listener
   * @param {Boolean} [options.once=false] A `Boolean` indicating that the
   *     listener should be invoked at most once after being added. If `true`,
   *     the listener would be automatically removed when invoked.
   * @public
   */
  addEventListener(type, handler, options = {}) {
    for (const listener of this.listeners(type)) {
      if (
        !options[kForOnEventAttribute$1] &&
        listener[kListener$1] === handler &&
        !listener[kForOnEventAttribute$1]
      ) {
        return;
      }
    }

    let wrapper;

    if (type === 'message') {
      wrapper = function onMessage(data, isBinary) {
        const event = new MessageEvent('message', {
          data: isBinary ? data : data.toString()
        });

        event[kTarget] = this;
        callListener(handler, this, event);
      };
    } else if (type === 'close') {
      wrapper = function onClose(code, message) {
        const event = new CloseEvent('close', {
          code,
          reason: message.toString(),
          wasClean: this._closeFrameReceived && this._closeFrameSent
        });

        event[kTarget] = this;
        callListener(handler, this, event);
      };
    } else if (type === 'error') {
      wrapper = function onError(error) {
        const event = new ErrorEvent('error', {
          error,
          message: error.message
        });

        event[kTarget] = this;
        callListener(handler, this, event);
      };
    } else if (type === 'open') {
      wrapper = function onOpen() {
        const event = new Event$1('open');

        event[kTarget] = this;
        callListener(handler, this, event);
      };
    } else {
      return;
    }

    wrapper[kForOnEventAttribute$1] = !!options[kForOnEventAttribute$1];
    wrapper[kListener$1] = handler;

    if (options.once) {
      this.once(type, wrapper);
    } else {
      this.on(type, wrapper);
    }
  },

  /**
   * Remove an event listener.
   *
   * @param {String} type A string representing the event type to remove
   * @param {(Function|Object)} handler The listener to remove
   * @public
   */
  removeEventListener(type, handler) {
    for (const listener of this.listeners(type)) {
      if (listener[kListener$1] === handler && !listener[kForOnEventAttribute$1]) {
        this.removeListener(type, listener);
        break;
      }
    }
  }
};

var eventTarget = {
  EventTarget};

/**
 * Call an event listener
 *
 * @param {(Function|Object)} listener The listener to call
 * @param {*} thisArg The value to use as `this`` when calling the listener
 * @param {Event} event The event to pass to the listener
 * @private
 */
function callListener(listener, thisArg, event) {
  if (typeof listener === 'object' && listener.handleEvent) {
    listener.handleEvent.call(listener, event);
  } else {
    listener.call(thisArg, event);
  }
}

const { tokenChars: tokenChars$1 } = validationExports;

/**
 * Adds an offer to the map of extension offers or a parameter to the map of
 * parameters.
 *
 * @param {Object} dest The map of extension offers or parameters
 * @param {String} name The extension or parameter name
 * @param {(Object|Boolean|String)} elem The extension parameters or the
 *     parameter value
 * @private
 */
function push(dest, name, elem) {
  if (dest[name] === undefined) dest[name] = [elem];
  else dest[name].push(elem);
}

/**
 * Parses the `Sec-WebSocket-Extensions` header into an object.
 *
 * @param {String} header The field value of the header
 * @return {Object} The parsed object
 * @public
 */
function parse$1(header) {
  const offers = Object.create(null);
  let params = Object.create(null);
  let mustUnescape = false;
  let isEscaping = false;
  let inQuotes = false;
  let extensionName;
  let paramName;
  let start = -1;
  let code = -1;
  let end = -1;
  let i = 0;

  for (; i < header.length; i++) {
    code = header.charCodeAt(i);

    if (extensionName === undefined) {
      if (end === -1 && tokenChars$1[code] === 1) {
        if (start === -1) start = i;
      } else if (
        i !== 0 &&
        (code === 0x20 /* ' ' */ || code === 0x09) /* '\t' */
      ) {
        if (end === -1 && start !== -1) end = i;
      } else if (code === 0x3b /* ';' */ || code === 0x2c /* ',' */) {
        if (start === -1) {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }

        if (end === -1) end = i;
        const name = header.slice(start, end);
        if (code === 0x2c) {
          push(offers, name, params);
          params = Object.create(null);
        } else {
          extensionName = name;
        }

        start = end = -1;
      } else {
        throw new SyntaxError(`Unexpected character at index ${i}`);
      }
    } else if (paramName === undefined) {
      if (end === -1 && tokenChars$1[code] === 1) {
        if (start === -1) start = i;
      } else if (code === 0x20 || code === 0x09) {
        if (end === -1 && start !== -1) end = i;
      } else if (code === 0x3b || code === 0x2c) {
        if (start === -1) {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }

        if (end === -1) end = i;
        push(params, header.slice(start, end), true);
        if (code === 0x2c) {
          push(offers, extensionName, params);
          params = Object.create(null);
          extensionName = undefined;
        }

        start = end = -1;
      } else if (code === 0x3d /* '=' */ && start !== -1 && end === -1) {
        paramName = header.slice(start, i);
        start = end = -1;
      } else {
        throw new SyntaxError(`Unexpected character at index ${i}`);
      }
    } else {
      //
      // The value of a quoted-string after unescaping must conform to the
      // token ABNF, so only token characters are valid.
      // Ref: https://tools.ietf.org/html/rfc6455#section-9.1
      //
      if (isEscaping) {
        if (tokenChars$1[code] !== 1) {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
        if (start === -1) start = i;
        else if (!mustUnescape) mustUnescape = true;
        isEscaping = false;
      } else if (inQuotes) {
        if (tokenChars$1[code] === 1) {
          if (start === -1) start = i;
        } else if (code === 0x22 /* '"' */ && start !== -1) {
          inQuotes = false;
          end = i;
        } else if (code === 0x5c /* '\' */) {
          isEscaping = true;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      } else if (code === 0x22 && header.charCodeAt(i - 1) === 0x3d) {
        inQuotes = true;
      } else if (end === -1 && tokenChars$1[code] === 1) {
        if (start === -1) start = i;
      } else if (start !== -1 && (code === 0x20 || code === 0x09)) {
        if (end === -1) end = i;
      } else if (code === 0x3b || code === 0x2c) {
        if (start === -1) {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }

        if (end === -1) end = i;
        let value = header.slice(start, end);
        if (mustUnescape) {
          value = value.replace(/\\/g, '');
          mustUnescape = false;
        }
        push(params, paramName, value);
        if (code === 0x2c) {
          push(offers, extensionName, params);
          params = Object.create(null);
          extensionName = undefined;
        }

        paramName = undefined;
        start = end = -1;
      } else {
        throw new SyntaxError(`Unexpected character at index ${i}`);
      }
    }
  }

  if (start === -1 || inQuotes || code === 0x20 || code === 0x09) {
    throw new SyntaxError('Unexpected end of input');
  }

  if (end === -1) end = i;
  const token = header.slice(start, end);
  if (extensionName === undefined) {
    push(offers, token, params);
  } else {
    if (paramName === undefined) {
      push(params, token, true);
    } else if (mustUnescape) {
      push(params, paramName, token.replace(/\\/g, ''));
    } else {
      push(params, paramName, token);
    }
    push(offers, extensionName, params);
  }

  return offers;
}

/**
 * Builds the `Sec-WebSocket-Extensions` header field value.
 *
 * @param {Object} extensions The map of extensions and parameters to format
 * @return {String} A string representing the given object
 * @public
 */
function format$1(extensions) {
  return Object.keys(extensions)
    .map((extension) => {
      let configurations = extensions[extension];
      if (!Array.isArray(configurations)) configurations = [configurations];
      return configurations
        .map((params) => {
          return [extension]
            .concat(
              Object.keys(params).map((k) => {
                let values = params[k];
                if (!Array.isArray(values)) values = [values];
                return values
                  .map((v) => (v === true ? k : `${k}=${v}`))
                  .join('; ');
              })
            )
            .join('; ');
        })
        .join(', ');
    })
    .join(', ');
}

var extension = { format: format$1, parse: parse$1 };

/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "^Duplex|Readable$", "caughtErrors": "none" }] */

const EventEmitter = require$$0$3;
const https = require$$1$1;
const http = require$$2;
const net = require$$3;
const tls = require$$4;
const { randomBytes, createHash: createHash$1 } = require$$1;
const { Duplex: Duplex$2, Readable } = require$$0$2;
const { URL: URL$1 } = require$$7;

const PerMessageDeflate = permessageDeflate;
const Receiver = receiver;
const Sender = sender;
const { isBlob } = validationExports;

const {
  BINARY_TYPES,
  CLOSE_TIMEOUT: CLOSE_TIMEOUT$1,
  EMPTY_BUFFER,
  GUID: GUID$1,
  kForOnEventAttribute,
  kListener,
  kStatusCode,
  kWebSocket: kWebSocket$1,
  NOOP
} = constants;
const {
  EventTarget: { addEventListener, removeEventListener }
} = eventTarget;
const { format, parse } = extension;
const { toBuffer } = bufferUtilExports;

const kAborted = Symbol('kAborted');
const protocolVersions = [8, 13];
const readyStates = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
const subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;

/**
 * Class representing a WebSocket.
 *
 * @extends EventEmitter
 */
class WebSocket extends EventEmitter {
  /**
   * Create a new `WebSocket`.
   *
   * @param {(String|URL)} address The URL to which to connect
   * @param {(String|String[])} [protocols] The subprotocols
   * @param {Object} [options] Connection options
   */
  constructor(address, protocols, options) {
    super();

    this._binaryType = BINARY_TYPES[0];
    this._closeCode = 1006;
    this._closeFrameReceived = false;
    this._closeFrameSent = false;
    this._closeMessage = EMPTY_BUFFER;
    this._closeTimer = null;
    this._errorEmitted = false;
    this._extensions = {};
    this._paused = false;
    this._protocol = '';
    this._readyState = WebSocket.CONNECTING;
    this._receiver = null;
    this._sender = null;
    this._socket = null;

    if (address !== null) {
      this._bufferedAmount = 0;
      this._isServer = false;
      this._redirects = 0;

      if (protocols === undefined) {
        protocols = [];
      } else if (!Array.isArray(protocols)) {
        if (typeof protocols === 'object' && protocols !== null) {
          options = protocols;
          protocols = [];
        } else {
          protocols = [protocols];
        }
      }

      initAsClient(this, address, protocols, options);
    } else {
      this._autoPong = options.autoPong;
      this._closeTimeout = options.closeTimeout;
      this._isServer = true;
    }
  }

  /**
   * For historical reasons, the custom "nodebuffer" type is used by the default
   * instead of "blob".
   *
   * @type {String}
   */
  get binaryType() {
    return this._binaryType;
  }

  set binaryType(type) {
    if (!BINARY_TYPES.includes(type)) return;

    this._binaryType = type;

    //
    // Allow to change `binaryType` on the fly.
    //
    if (this._receiver) this._receiver._binaryType = type;
  }

  /**
   * @type {Number}
   */
  get bufferedAmount() {
    if (!this._socket) return this._bufferedAmount;

    return this._socket._writableState.length + this._sender._bufferedBytes;
  }

  /**
   * @type {String}
   */
  get extensions() {
    return Object.keys(this._extensions).join();
  }

  /**
   * @type {Boolean}
   */
  get isPaused() {
    return this._paused;
  }

  /**
   * @type {Function}
   */
  /* istanbul ignore next */
  get onclose() {
    return null;
  }

  /**
   * @type {Function}
   */
  /* istanbul ignore next */
  get onerror() {
    return null;
  }

  /**
   * @type {Function}
   */
  /* istanbul ignore next */
  get onopen() {
    return null;
  }

  /**
   * @type {Function}
   */
  /* istanbul ignore next */
  get onmessage() {
    return null;
  }

  /**
   * @type {String}
   */
  get protocol() {
    return this._protocol;
  }

  /**
   * @type {Number}
   */
  get readyState() {
    return this._readyState;
  }

  /**
   * @type {String}
   */
  get url() {
    return this._url;
  }

  /**
   * Set up the socket and the internal resources.
   *
   * @param {Duplex} socket The network socket between the server and client
   * @param {Buffer} head The first packet of the upgraded stream
   * @param {Object} options Options object
   * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
   *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
   *     multiple times in the same tick
   * @param {Function} [options.generateMask] The function used to generate the
   *     masking key
   * @param {Number} [options.maxPayload=0] The maximum allowed message size
   * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
   *     not to skip UTF-8 validation for text and close messages
   * @private
   */
  setSocket(socket, head, options) {
    const receiver = new Receiver({
      allowSynchronousEvents: options.allowSynchronousEvents,
      binaryType: this.binaryType,
      extensions: this._extensions,
      isServer: this._isServer,
      maxPayload: options.maxPayload,
      skipUTF8Validation: options.skipUTF8Validation
    });

    const sender = new Sender(socket, this._extensions, options.generateMask);

    this._receiver = receiver;
    this._sender = sender;
    this._socket = socket;

    receiver[kWebSocket$1] = this;
    sender[kWebSocket$1] = this;
    socket[kWebSocket$1] = this;

    receiver.on('conclude', receiverOnConclude);
    receiver.on('drain', receiverOnDrain);
    receiver.on('error', receiverOnError);
    receiver.on('message', receiverOnMessage);
    receiver.on('ping', receiverOnPing);
    receiver.on('pong', receiverOnPong);

    sender.onerror = senderOnError;

    //
    // These methods may not be available if `socket` is just a `Duplex`.
    //
    if (socket.setTimeout) socket.setTimeout(0);
    if (socket.setNoDelay) socket.setNoDelay();

    if (head.length > 0) socket.unshift(head);

    socket.on('close', socketOnClose);
    socket.on('data', socketOnData);
    socket.on('end', socketOnEnd);
    socket.on('error', socketOnError);

    this._readyState = WebSocket.OPEN;
    this.emit('open');
  }

  /**
   * Emit the `'close'` event.
   *
   * @private
   */
  emitClose() {
    if (!this._socket) {
      this._readyState = WebSocket.CLOSED;
      this.emit('close', this._closeCode, this._closeMessage);
      return;
    }

    if (this._extensions[PerMessageDeflate.extensionName]) {
      this._extensions[PerMessageDeflate.extensionName].cleanup();
    }

    this._receiver.removeAllListeners();
    this._readyState = WebSocket.CLOSED;
    this.emit('close', this._closeCode, this._closeMessage);
  }

  /**
   * Start a closing handshake.
   *
   *          +----------+   +-----------+   +----------+
   *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
   *    |     +----------+   +-----------+   +----------+     |
   *          +----------+   +-----------+         |
   * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
   *          +----------+   +-----------+   |
   *    |           |                        |   +---+        |
   *                +------------------------+-->|fin| - - - -
   *    |         +---+                      |   +---+
   *     - - - - -|fin|<---------------------+
   *              +---+
   *
   * @param {Number} [code] Status code explaining why the connection is closing
   * @param {(String|Buffer)} [data] The reason why the connection is
   *     closing
   * @public
   */
  close(code, data) {
    if (this.readyState === WebSocket.CLOSED) return;
    if (this.readyState === WebSocket.CONNECTING) {
      const msg = 'WebSocket was closed before the connection was established';
      abortHandshake(this, this._req, msg);
      return;
    }

    if (this.readyState === WebSocket.CLOSING) {
      if (
        this._closeFrameSent &&
        (this._closeFrameReceived || this._receiver._writableState.errorEmitted)
      ) {
        this._socket.end();
      }

      return;
    }

    this._readyState = WebSocket.CLOSING;
    this._sender.close(code, data, !this._isServer, (err) => {
      //
      // This error is handled by the `'error'` listener on the socket. We only
      // want to know if the close frame has been sent here.
      //
      if (err) return;

      this._closeFrameSent = true;

      if (
        this._closeFrameReceived ||
        this._receiver._writableState.errorEmitted
      ) {
        this._socket.end();
      }
    });

    setCloseTimer(this);
  }

  /**
   * Pause the socket.
   *
   * @public
   */
  pause() {
    if (
      this.readyState === WebSocket.CONNECTING ||
      this.readyState === WebSocket.CLOSED
    ) {
      return;
    }

    this._paused = true;
    this._socket.pause();
  }

  /**
   * Send a ping.
   *
   * @param {*} [data] The data to send
   * @param {Boolean} [mask] Indicates whether or not to mask `data`
   * @param {Function} [cb] Callback which is executed when the ping is sent
   * @public
   */
  ping(data, mask, cb) {
    if (this.readyState === WebSocket.CONNECTING) {
      throw new Error('WebSocket is not open: readyState 0 (CONNECTING)');
    }

    if (typeof data === 'function') {
      cb = data;
      data = mask = undefined;
    } else if (typeof mask === 'function') {
      cb = mask;
      mask = undefined;
    }

    if (typeof data === 'number') data = data.toString();

    if (this.readyState !== WebSocket.OPEN) {
      sendAfterClose(this, data, cb);
      return;
    }

    if (mask === undefined) mask = !this._isServer;
    this._sender.ping(data || EMPTY_BUFFER, mask, cb);
  }

  /**
   * Send a pong.
   *
   * @param {*} [data] The data to send
   * @param {Boolean} [mask] Indicates whether or not to mask `data`
   * @param {Function} [cb] Callback which is executed when the pong is sent
   * @public
   */
  pong(data, mask, cb) {
    if (this.readyState === WebSocket.CONNECTING) {
      throw new Error('WebSocket is not open: readyState 0 (CONNECTING)');
    }

    if (typeof data === 'function') {
      cb = data;
      data = mask = undefined;
    } else if (typeof mask === 'function') {
      cb = mask;
      mask = undefined;
    }

    if (typeof data === 'number') data = data.toString();

    if (this.readyState !== WebSocket.OPEN) {
      sendAfterClose(this, data, cb);
      return;
    }

    if (mask === undefined) mask = !this._isServer;
    this._sender.pong(data || EMPTY_BUFFER, mask, cb);
  }

  /**
   * Resume the socket.
   *
   * @public
   */
  resume() {
    if (
      this.readyState === WebSocket.CONNECTING ||
      this.readyState === WebSocket.CLOSED
    ) {
      return;
    }

    this._paused = false;
    if (!this._receiver._writableState.needDrain) this._socket.resume();
  }

  /**
   * Send a data message.
   *
   * @param {*} data The message to send
   * @param {Object} [options] Options object
   * @param {Boolean} [options.binary] Specifies whether `data` is binary or
   *     text
   * @param {Boolean} [options.compress] Specifies whether or not to compress
   *     `data`
   * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
   *     last one
   * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
   * @param {Function} [cb] Callback which is executed when data is written out
   * @public
   */
  send(data, options, cb) {
    if (this.readyState === WebSocket.CONNECTING) {
      throw new Error('WebSocket is not open: readyState 0 (CONNECTING)');
    }

    if (typeof options === 'function') {
      cb = options;
      options = {};
    }

    if (typeof data === 'number') data = data.toString();

    if (this.readyState !== WebSocket.OPEN) {
      sendAfterClose(this, data, cb);
      return;
    }

    const opts = {
      binary: typeof data !== 'string',
      mask: !this._isServer,
      compress: true,
      fin: true,
      ...options
    };

    if (!this._extensions[PerMessageDeflate.extensionName]) {
      opts.compress = false;
    }

    this._sender.send(data || EMPTY_BUFFER, opts, cb);
  }

  /**
   * Forcibly close the connection.
   *
   * @public
   */
  terminate() {
    if (this.readyState === WebSocket.CLOSED) return;
    if (this.readyState === WebSocket.CONNECTING) {
      const msg = 'WebSocket was closed before the connection was established';
      abortHandshake(this, this._req, msg);
      return;
    }

    if (this._socket) {
      this._readyState = WebSocket.CLOSING;
      this._socket.destroy();
    }
  }
}

/**
 * @constant {Number} CONNECTING
 * @memberof WebSocket
 */
Object.defineProperty(WebSocket, 'CONNECTING', {
  enumerable: true,
  value: readyStates.indexOf('CONNECTING')
});

/**
 * @constant {Number} CONNECTING
 * @memberof WebSocket.prototype
 */
Object.defineProperty(WebSocket.prototype, 'CONNECTING', {
  enumerable: true,
  value: readyStates.indexOf('CONNECTING')
});

/**
 * @constant {Number} OPEN
 * @memberof WebSocket
 */
Object.defineProperty(WebSocket, 'OPEN', {
  enumerable: true,
  value: readyStates.indexOf('OPEN')
});

/**
 * @constant {Number} OPEN
 * @memberof WebSocket.prototype
 */
Object.defineProperty(WebSocket.prototype, 'OPEN', {
  enumerable: true,
  value: readyStates.indexOf('OPEN')
});

/**
 * @constant {Number} CLOSING
 * @memberof WebSocket
 */
Object.defineProperty(WebSocket, 'CLOSING', {
  enumerable: true,
  value: readyStates.indexOf('CLOSING')
});

/**
 * @constant {Number} CLOSING
 * @memberof WebSocket.prototype
 */
Object.defineProperty(WebSocket.prototype, 'CLOSING', {
  enumerable: true,
  value: readyStates.indexOf('CLOSING')
});

/**
 * @constant {Number} CLOSED
 * @memberof WebSocket
 */
Object.defineProperty(WebSocket, 'CLOSED', {
  enumerable: true,
  value: readyStates.indexOf('CLOSED')
});

/**
 * @constant {Number} CLOSED
 * @memberof WebSocket.prototype
 */
Object.defineProperty(WebSocket.prototype, 'CLOSED', {
  enumerable: true,
  value: readyStates.indexOf('CLOSED')
});

[
  'binaryType',
  'bufferedAmount',
  'extensions',
  'isPaused',
  'protocol',
  'readyState',
  'url'
].forEach((property) => {
  Object.defineProperty(WebSocket.prototype, property, { enumerable: true });
});

//
// Add the `onopen`, `onerror`, `onclose`, and `onmessage` attributes.
// See https://html.spec.whatwg.org/multipage/comms.html#the-websocket-interface
//
['open', 'error', 'close', 'message'].forEach((method) => {
  Object.defineProperty(WebSocket.prototype, `on${method}`, {
    enumerable: true,
    get() {
      for (const listener of this.listeners(method)) {
        if (listener[kForOnEventAttribute]) return listener[kListener];
      }

      return null;
    },
    set(handler) {
      for (const listener of this.listeners(method)) {
        if (listener[kForOnEventAttribute]) {
          this.removeListener(method, listener);
          break;
        }
      }

      if (typeof handler !== 'function') return;

      this.addEventListener(method, handler, {
        [kForOnEventAttribute]: true
      });
    }
  });
});

WebSocket.prototype.addEventListener = addEventListener;
WebSocket.prototype.removeEventListener = removeEventListener;

var websocket = WebSocket;

/**
 * Initialize a WebSocket client.
 *
 * @param {WebSocket} websocket The client to initialize
 * @param {(String|URL)} address The URL to which to connect
 * @param {Array} protocols The subprotocols
 * @param {Object} [options] Connection options
 * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether any
 *     of the `'message'`, `'ping'`, and `'pong'` events can be emitted multiple
 *     times in the same tick
 * @param {Boolean} [options.autoPong=true] Specifies whether or not to
 *     automatically send a pong in response to a ping
 * @param {Number} [options.closeTimeout=30000] Duration in milliseconds to wait
 *     for the closing handshake to finish after `websocket.close()` is called
 * @param {Function} [options.finishRequest] A function which can be used to
 *     customize the headers of each http request before it is sent
 * @param {Boolean} [options.followRedirects=false] Whether or not to follow
 *     redirects
 * @param {Function} [options.generateMask] The function used to generate the
 *     masking key
 * @param {Number} [options.handshakeTimeout] Timeout in milliseconds for the
 *     handshake request
 * @param {Number} [options.maxPayload=104857600] The maximum allowed message
 *     size
 * @param {Number} [options.maxRedirects=10] The maximum number of redirects
 *     allowed
 * @param {String} [options.origin] Value of the `Origin` or
 *     `Sec-WebSocket-Origin` header
 * @param {(Boolean|Object)} [options.perMessageDeflate=true] Enable/disable
 *     permessage-deflate
 * @param {Number} [options.protocolVersion=13] Value of the
 *     `Sec-WebSocket-Version` header
 * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
 *     not to skip UTF-8 validation for text and close messages
 * @private
 */
function initAsClient(websocket, address, protocols, options) {
  const opts = {
    allowSynchronousEvents: true,
    autoPong: true,
    closeTimeout: CLOSE_TIMEOUT$1,
    protocolVersion: protocolVersions[1],
    maxPayload: 100 * 1024 * 1024,
    skipUTF8Validation: false,
    perMessageDeflate: true,
    followRedirects: false,
    maxRedirects: 10,
    ...options,
    socketPath: undefined,
    hostname: undefined,
    protocol: undefined,
    timeout: undefined,
    method: 'GET',
    host: undefined,
    path: undefined,
    port: undefined
  };

  websocket._autoPong = opts.autoPong;
  websocket._closeTimeout = opts.closeTimeout;

  if (!protocolVersions.includes(opts.protocolVersion)) {
    throw new RangeError(
      `Unsupported protocol version: ${opts.protocolVersion} ` +
        `(supported versions: ${protocolVersions.join(', ')})`
    );
  }

  let parsedUrl;

  if (address instanceof URL$1) {
    parsedUrl = address;
  } else {
    try {
      parsedUrl = new URL$1(address);
    } catch (e) {
      throw new SyntaxError(`Invalid URL: ${address}`);
    }
  }

  if (parsedUrl.protocol === 'http:') {
    parsedUrl.protocol = 'ws:';
  } else if (parsedUrl.protocol === 'https:') {
    parsedUrl.protocol = 'wss:';
  }

  websocket._url = parsedUrl.href;

  const isSecure = parsedUrl.protocol === 'wss:';
  const isIpcUrl = parsedUrl.protocol === 'ws+unix:';
  let invalidUrlMessage;

  if (parsedUrl.protocol !== 'ws:' && !isSecure && !isIpcUrl) {
    invalidUrlMessage =
      'The URL\'s protocol must be one of "ws:", "wss:", ' +
      '"http:", "https:", or "ws+unix:"';
  } else if (isIpcUrl && !parsedUrl.pathname) {
    invalidUrlMessage = "The URL's pathname is empty";
  } else if (parsedUrl.hash) {
    invalidUrlMessage = 'The URL contains a fragment identifier';
  }

  if (invalidUrlMessage) {
    const err = new SyntaxError(invalidUrlMessage);

    if (websocket._redirects === 0) {
      throw err;
    } else {
      emitErrorAndClose(websocket, err);
      return;
    }
  }

  const defaultPort = isSecure ? 443 : 80;
  const key = randomBytes(16).toString('base64');
  const request = isSecure ? https.request : http.request;
  const protocolSet = new Set();
  let perMessageDeflate;

  opts.createConnection =
    opts.createConnection || (isSecure ? tlsConnect : netConnect);
  opts.defaultPort = opts.defaultPort || defaultPort;
  opts.port = parsedUrl.port || defaultPort;
  opts.host = parsedUrl.hostname.startsWith('[')
    ? parsedUrl.hostname.slice(1, -1)
    : parsedUrl.hostname;
  opts.headers = {
    ...opts.headers,
    'Sec-WebSocket-Version': opts.protocolVersion,
    'Sec-WebSocket-Key': key,
    Connection: 'Upgrade',
    Upgrade: 'websocket'
  };
  opts.path = parsedUrl.pathname + parsedUrl.search;
  opts.timeout = opts.handshakeTimeout;

  if (opts.perMessageDeflate) {
    perMessageDeflate = new PerMessageDeflate(
      opts.perMessageDeflate !== true ? opts.perMessageDeflate : {},
      false,
      opts.maxPayload
    );
    opts.headers['Sec-WebSocket-Extensions'] = format({
      [PerMessageDeflate.extensionName]: perMessageDeflate.offer()
    });
  }
  if (protocols.length) {
    for (const protocol of protocols) {
      if (
        typeof protocol !== 'string' ||
        !subprotocolRegex.test(protocol) ||
        protocolSet.has(protocol)
      ) {
        throw new SyntaxError(
          'An invalid or duplicated subprotocol was specified'
        );
      }

      protocolSet.add(protocol);
    }

    opts.headers['Sec-WebSocket-Protocol'] = protocols.join(',');
  }
  if (opts.origin) {
    if (opts.protocolVersion < 13) {
      opts.headers['Sec-WebSocket-Origin'] = opts.origin;
    } else {
      opts.headers.Origin = opts.origin;
    }
  }
  if (parsedUrl.username || parsedUrl.password) {
    opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
  }

  if (isIpcUrl) {
    const parts = opts.path.split(':');

    opts.socketPath = parts[0];
    opts.path = parts[1];
  }

  let req;

  if (opts.followRedirects) {
    if (websocket._redirects === 0) {
      websocket._originalIpc = isIpcUrl;
      websocket._originalSecure = isSecure;
      websocket._originalHostOrSocketPath = isIpcUrl
        ? opts.socketPath
        : parsedUrl.host;

      const headers = options && options.headers;

      //
      // Shallow copy the user provided options so that headers can be changed
      // without mutating the original object.
      //
      options = { ...options, headers: {} };

      if (headers) {
        for (const [key, value] of Object.entries(headers)) {
          options.headers[key.toLowerCase()] = value;
        }
      }
    } else if (websocket.listenerCount('redirect') === 0) {
      const isSameHost = isIpcUrl
        ? websocket._originalIpc
          ? opts.socketPath === websocket._originalHostOrSocketPath
          : false
        : websocket._originalIpc
          ? false
          : parsedUrl.host === websocket._originalHostOrSocketPath;

      if (!isSameHost || (websocket._originalSecure && !isSecure)) {
        //
        // Match curl 7.77.0 behavior and drop the following headers. These
        // headers are also dropped when following a redirect to a subdomain.
        //
        delete opts.headers.authorization;
        delete opts.headers.cookie;

        if (!isSameHost) delete opts.headers.host;

        opts.auth = undefined;
      }
    }

    //
    // Match curl 7.77.0 behavior and make the first `Authorization` header win.
    // If the `Authorization` header is set, then there is nothing to do as it
    // will take precedence.
    //
    if (opts.auth && !options.headers.authorization) {
      options.headers.authorization =
        'Basic ' + Buffer.from(opts.auth).toString('base64');
    }

    req = websocket._req = request(opts);

    if (websocket._redirects) {
      //
      // Unlike what is done for the `'upgrade'` event, no early exit is
      // triggered here if the user calls `websocket.close()` or
      // `websocket.terminate()` from a listener of the `'redirect'` event. This
      // is because the user can also call `request.destroy()` with an error
      // before calling `websocket.close()` or `websocket.terminate()` and this
      // would result in an error being emitted on the `request` object with no
      // `'error'` event listeners attached.
      //
      websocket.emit('redirect', websocket.url, req);
    }
  } else {
    req = websocket._req = request(opts);
  }

  if (opts.timeout) {
    req.on('timeout', () => {
      abortHandshake(websocket, req, 'Opening handshake has timed out');
    });
  }

  req.on('error', (err) => {
    if (req === null || req[kAborted]) return;

    req = websocket._req = null;
    emitErrorAndClose(websocket, err);
  });

  req.on('response', (res) => {
    const location = res.headers.location;
    const statusCode = res.statusCode;

    if (
      location &&
      opts.followRedirects &&
      statusCode >= 300 &&
      statusCode < 400
    ) {
      if (++websocket._redirects > opts.maxRedirects) {
        abortHandshake(websocket, req, 'Maximum redirects exceeded');
        return;
      }

      req.abort();

      let addr;

      try {
        addr = new URL$1(location, address);
      } catch (e) {
        const err = new SyntaxError(`Invalid URL: ${location}`);
        emitErrorAndClose(websocket, err);
        return;
      }

      initAsClient(websocket, addr, protocols, options);
    } else if (!websocket.emit('unexpected-response', req, res)) {
      abortHandshake(
        websocket,
        req,
        `Unexpected server response: ${res.statusCode}`
      );
    }
  });

  req.on('upgrade', (res, socket, head) => {
    websocket.emit('upgrade', res);

    //
    // The user may have closed the connection from a listener of the
    // `'upgrade'` event.
    //
    if (websocket.readyState !== WebSocket.CONNECTING) return;

    req = websocket._req = null;

    const upgrade = res.headers.upgrade;

    if (upgrade === undefined || upgrade.toLowerCase() !== 'websocket') {
      abortHandshake(websocket, socket, 'Invalid Upgrade header');
      return;
    }

    const digest = createHash$1('sha1')
      .update(key + GUID$1)
      .digest('base64');

    if (res.headers['sec-websocket-accept'] !== digest) {
      abortHandshake(websocket, socket, 'Invalid Sec-WebSocket-Accept header');
      return;
    }

    const serverProt = res.headers['sec-websocket-protocol'];
    let protError;

    if (serverProt !== undefined) {
      if (!protocolSet.size) {
        protError = 'Server sent a subprotocol but none was requested';
      } else if (!protocolSet.has(serverProt)) {
        protError = 'Server sent an invalid subprotocol';
      }
    } else if (protocolSet.size) {
      protError = 'Server sent no subprotocol';
    }

    if (protError) {
      abortHandshake(websocket, socket, protError);
      return;
    }

    if (serverProt) websocket._protocol = serverProt;

    const secWebSocketExtensions = res.headers['sec-websocket-extensions'];

    if (secWebSocketExtensions !== undefined) {
      if (!perMessageDeflate) {
        const message =
          'Server sent a Sec-WebSocket-Extensions header but no extension ' +
          'was requested';
        abortHandshake(websocket, socket, message);
        return;
      }

      let extensions;

      try {
        extensions = parse(secWebSocketExtensions);
      } catch (err) {
        const message = 'Invalid Sec-WebSocket-Extensions header';
        abortHandshake(websocket, socket, message);
        return;
      }

      const extensionNames = Object.keys(extensions);

      if (
        extensionNames.length !== 1 ||
        extensionNames[0] !== PerMessageDeflate.extensionName
      ) {
        const message = 'Server indicated an extension that was not requested';
        abortHandshake(websocket, socket, message);
        return;
      }

      try {
        perMessageDeflate.accept(extensions[PerMessageDeflate.extensionName]);
      } catch (err) {
        const message = 'Invalid Sec-WebSocket-Extensions header';
        abortHandshake(websocket, socket, message);
        return;
      }

      websocket._extensions[PerMessageDeflate.extensionName] =
        perMessageDeflate;
    }

    websocket.setSocket(socket, head, {
      allowSynchronousEvents: opts.allowSynchronousEvents,
      generateMask: opts.generateMask,
      maxPayload: opts.maxPayload,
      skipUTF8Validation: opts.skipUTF8Validation
    });
  });

  if (opts.finishRequest) {
    opts.finishRequest(req, websocket);
  } else {
    req.end();
  }
}

/**
 * Emit the `'error'` and `'close'` events.
 *
 * @param {WebSocket} websocket The WebSocket instance
 * @param {Error} The error to emit
 * @private
 */
function emitErrorAndClose(websocket, err) {
  websocket._readyState = WebSocket.CLOSING;
  //
  // The following assignment is practically useless and is done only for
  // consistency.
  //
  websocket._errorEmitted = true;
  websocket.emit('error', err);
  websocket.emitClose();
}

/**
 * Create a `net.Socket` and initiate a connection.
 *
 * @param {Object} options Connection options
 * @return {net.Socket} The newly created socket used to start the connection
 * @private
 */
function netConnect(options) {
  options.path = options.socketPath;
  return net.connect(options);
}

/**
 * Create a `tls.TLSSocket` and initiate a connection.
 *
 * @param {Object} options Connection options
 * @return {tls.TLSSocket} The newly created socket used to start the connection
 * @private
 */
function tlsConnect(options) {
  options.path = undefined;

  if (!options.servername && options.servername !== '') {
    options.servername = net.isIP(options.host) ? '' : options.host;
  }

  return tls.connect(options);
}

/**
 * Abort the handshake and emit an error.
 *
 * @param {WebSocket} websocket The WebSocket instance
 * @param {(http.ClientRequest|net.Socket|tls.Socket)} stream The request to
 *     abort or the socket to destroy
 * @param {String} message The error message
 * @private
 */
function abortHandshake(websocket, stream, message) {
  websocket._readyState = WebSocket.CLOSING;

  const err = new Error(message);
  Error.captureStackTrace(err, abortHandshake);

  if (stream.setHeader) {
    stream[kAborted] = true;
    stream.abort();

    if (stream.socket && !stream.socket.destroyed) {
      //
      // On Node.js >= 14.3.0 `request.abort()` does not destroy the socket if
      // called after the request completed. See
      // https://github.com/websockets/ws/issues/1869.
      //
      stream.socket.destroy();
    }

    process.nextTick(emitErrorAndClose, websocket, err);
  } else {
    stream.destroy(err);
    stream.once('error', websocket.emit.bind(websocket, 'error'));
    stream.once('close', websocket.emitClose.bind(websocket));
  }
}

/**
 * Handle cases where the `ping()`, `pong()`, or `send()` methods are called
 * when the `readyState` attribute is `CLOSING` or `CLOSED`.
 *
 * @param {WebSocket} websocket The WebSocket instance
 * @param {*} [data] The data to send
 * @param {Function} [cb] Callback
 * @private
 */
function sendAfterClose(websocket, data, cb) {
  if (data) {
    const length = isBlob(data) ? data.size : toBuffer(data).length;

    //
    // The `_bufferedAmount` property is used only when the peer is a client and
    // the opening handshake fails. Under these circumstances, in fact, the
    // `setSocket()` method is not called, so the `_socket` and `_sender`
    // properties are set to `null`.
    //
    if (websocket._socket) websocket._sender._bufferedBytes += length;
    else websocket._bufferedAmount += length;
  }

  if (cb) {
    const err = new Error(
      `WebSocket is not open: readyState ${websocket.readyState} ` +
        `(${readyStates[websocket.readyState]})`
    );
    process.nextTick(cb, err);
  }
}

/**
 * The listener of the `Receiver` `'conclude'` event.
 *
 * @param {Number} code The status code
 * @param {Buffer} reason The reason for closing
 * @private
 */
function receiverOnConclude(code, reason) {
  const websocket = this[kWebSocket$1];

  websocket._closeFrameReceived = true;
  websocket._closeMessage = reason;
  websocket._closeCode = code;

  if (websocket._socket[kWebSocket$1] === undefined) return;

  websocket._socket.removeListener('data', socketOnData);
  process.nextTick(resume, websocket._socket);

  if (code === 1005) websocket.close();
  else websocket.close(code, reason);
}

/**
 * The listener of the `Receiver` `'drain'` event.
 *
 * @private
 */
function receiverOnDrain() {
  const websocket = this[kWebSocket$1];

  if (!websocket.isPaused) websocket._socket.resume();
}

/**
 * The listener of the `Receiver` `'error'` event.
 *
 * @param {(RangeError|Error)} err The emitted error
 * @private
 */
function receiverOnError(err) {
  const websocket = this[kWebSocket$1];

  if (websocket._socket[kWebSocket$1] !== undefined) {
    websocket._socket.removeListener('data', socketOnData);

    //
    // On Node.js < 14.0.0 the `'error'` event is emitted synchronously. See
    // https://github.com/websockets/ws/issues/1940.
    //
    process.nextTick(resume, websocket._socket);

    websocket.close(err[kStatusCode]);
  }

  if (!websocket._errorEmitted) {
    websocket._errorEmitted = true;
    websocket.emit('error', err);
  }
}

/**
 * The listener of the `Receiver` `'finish'` event.
 *
 * @private
 */
function receiverOnFinish() {
  this[kWebSocket$1].emitClose();
}

/**
 * The listener of the `Receiver` `'message'` event.
 *
 * @param {Buffer|ArrayBuffer|Buffer[])} data The message
 * @param {Boolean} isBinary Specifies whether the message is binary or not
 * @private
 */
function receiverOnMessage(data, isBinary) {
  this[kWebSocket$1].emit('message', data, isBinary);
}

/**
 * The listener of the `Receiver` `'ping'` event.
 *
 * @param {Buffer} data The data included in the ping frame
 * @private
 */
function receiverOnPing(data) {
  const websocket = this[kWebSocket$1];

  if (websocket._autoPong) websocket.pong(data, !this._isServer, NOOP);
  websocket.emit('ping', data);
}

/**
 * The listener of the `Receiver` `'pong'` event.
 *
 * @param {Buffer} data The data included in the pong frame
 * @private
 */
function receiverOnPong(data) {
  this[kWebSocket$1].emit('pong', data);
}

/**
 * Resume a readable stream
 *
 * @param {Readable} stream The readable stream
 * @private
 */
function resume(stream) {
  stream.resume();
}

/**
 * The `Sender` error event handler.
 *
 * @param {Error} The error
 * @private
 */
function senderOnError(err) {
  const websocket = this[kWebSocket$1];

  if (websocket.readyState === WebSocket.CLOSED) return;
  if (websocket.readyState === WebSocket.OPEN) {
    websocket._readyState = WebSocket.CLOSING;
    setCloseTimer(websocket);
  }

  //
  // `socket.end()` is used instead of `socket.destroy()` to allow the other
  // peer to finish sending queued data. There is no need to set a timer here
  // because `CLOSING` means that it is already set or not needed.
  //
  this._socket.end();

  if (!websocket._errorEmitted) {
    websocket._errorEmitted = true;
    websocket.emit('error', err);
  }
}

/**
 * Set a timer to destroy the underlying raw socket of a WebSocket.
 *
 * @param {WebSocket} websocket The WebSocket instance
 * @private
 */
function setCloseTimer(websocket) {
  websocket._closeTimer = setTimeout(
    websocket._socket.destroy.bind(websocket._socket),
    websocket._closeTimeout
  );
}

/**
 * The listener of the socket `'close'` event.
 *
 * @private
 */
function socketOnClose() {
  const websocket = this[kWebSocket$1];

  this.removeListener('close', socketOnClose);
  this.removeListener('data', socketOnData);
  this.removeListener('end', socketOnEnd);

  websocket._readyState = WebSocket.CLOSING;

  //
  // The close frame might not have been received or the `'end'` event emitted,
  // for example, if the socket was destroyed due to an error. Ensure that the
  // `receiver` stream is closed after writing any remaining buffered data to
  // it. If the readable side of the socket is in flowing mode then there is no
  // buffered data as everything has been already written. If instead, the
  // socket is paused, any possible buffered data will be read as a single
  // chunk.
  //
  if (
    !this._readableState.endEmitted &&
    !websocket._closeFrameReceived &&
    !websocket._receiver._writableState.errorEmitted &&
    this._readableState.length !== 0
  ) {
    const chunk = this.read(this._readableState.length);

    websocket._receiver.write(chunk);
  }

  websocket._receiver.end();

  this[kWebSocket$1] = undefined;

  clearTimeout(websocket._closeTimer);

  if (
    websocket._receiver._writableState.finished ||
    websocket._receiver._writableState.errorEmitted
  ) {
    websocket.emitClose();
  } else {
    websocket._receiver.on('error', receiverOnFinish);
    websocket._receiver.on('finish', receiverOnFinish);
  }
}

/**
 * The listener of the socket `'data'` event.
 *
 * @param {Buffer} chunk A chunk of data
 * @private
 */
function socketOnData(chunk) {
  if (!this[kWebSocket$1]._receiver.write(chunk)) {
    this.pause();
  }
}

/**
 * The listener of the socket `'end'` event.
 *
 * @private
 */
function socketOnEnd() {
  const websocket = this[kWebSocket$1];

  websocket._readyState = WebSocket.CLOSING;
  websocket._receiver.end();
  this.end();
}

/**
 * The listener of the socket `'error'` event.
 *
 * @private
 */
function socketOnError() {
  const websocket = this[kWebSocket$1];

  this.removeListener('error', socketOnError);
  this.on('error', NOOP);

  if (websocket) {
    websocket._readyState = WebSocket.CLOSING;
    this.destroy();
  }
}

var WebSocket$1 = /*@__PURE__*/getDefaultExportFromCjs(websocket);

/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "^WebSocket$" }] */
const { Duplex: Duplex$1 } = require$$0$2;

const { tokenChars } = validationExports;

/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "^Duplex$", "caughtErrors": "none" }] */
const { Duplex } = require$$0$2;
const { createHash } = require$$1;
const { CLOSE_TIMEOUT, GUID, kWebSocket } = constants;

/**!
 * @author Elgato
 * @module elgato/streamdeck
 * @license MIT
 * @copyright Copyright (c) Corsair Memory Inc.
 */
/**
 * Stream Deck device types.
 */
var DeviceType;
(function (DeviceType) {
    /**
     * Stream Deck, comprised of 15 customizable LCD keys in a 5 x 3 layout.
     */
    DeviceType[DeviceType["StreamDeck"] = 0] = "StreamDeck";
    /**
     * Stream Deck Mini, comprised of 6 customizable LCD keys in a 3 x 2 layout.
     */
    DeviceType[DeviceType["StreamDeckMini"] = 1] = "StreamDeckMini";
    /**
     * Stream Deck XL, comprised of 32 customizable LCD keys in an 8 x 4 layout.
     */
    DeviceType[DeviceType["StreamDeckXL"] = 2] = "StreamDeckXL";
    /**
     * Stream Deck Mobile, for iOS and Android.
     */
    DeviceType[DeviceType["StreamDeckMobile"] = 3] = "StreamDeckMobile";
    /**
     * Corsair G Keys, available on select Corsair keyboards.
     */
    DeviceType[DeviceType["CorsairGKeys"] = 4] = "CorsairGKeys";
    /**
     * Stream Deck Pedal, comprised of 3 customizable pedals.
     */
    DeviceType[DeviceType["StreamDeckPedal"] = 5] = "StreamDeckPedal";
    /**
     * Corsair Voyager laptop, comprising 10 buttons in a horizontal line above the keyboard.
     */
    DeviceType[DeviceType["CorsairVoyager"] = 6] = "CorsairVoyager";
    /**
     * Stream Deck +, comprised of 8 customizable LCD keys in a 4 x 2 layout, a touch strip, and 4 dials.
     */
    DeviceType[DeviceType["StreamDeckPlus"] = 7] = "StreamDeckPlus";
    /**
     * SCUF controller G keys, available on select SCUF controllers, for example SCUF Envision.
     */
    DeviceType[DeviceType["SCUFController"] = 8] = "SCUFController";
    /**
     * Stream Deck Neo, comprised of 8 customizable LCD keys in a 4 x 2 layout, an info bar, and 2 touch points for page navigation.
     */
    DeviceType[DeviceType["StreamDeckNeo"] = 9] = "StreamDeckNeo";
    /**
     * Stream Deck Studio, comprised of 32 customizable LCD keys in a 16 x 2 layout, and 2 dials (1 on either side).
     */
    DeviceType[DeviceType["StreamDeckStudio"] = 10] = "StreamDeckStudio";
    /**
     * Virtual Stream Deck, comprised of 1 to 64 action (on-screen) on a scalable canvas, with a maximum layout of 8 x 8.
     */
    DeviceType[DeviceType["VirtualStreamDeck"] = 11] = "VirtualStreamDeck";
})(DeviceType || (DeviceType = {}));

/**
 * List of available types that can be applied to {@link Bar} and {@link GBar} to determine their style.
 */
var BarSubType;
(function (BarSubType) {
    /**
     * Rectangle bar; the bar fills from left to right, determined by the {@link Bar.value}, similar to a standard progress bar.
     */
    BarSubType[BarSubType["Rectangle"] = 0] = "Rectangle";
    /**
     * Rectangle bar; the bar fills outwards from the centre of the bar, determined by the {@link Bar.value}.
     * @example
     * // Value is 2, range is 1-10.
     * // [  ███     ]
     * @example
     * // Value is 10, range is 1-10.
     * // [     █████]
     */
    BarSubType[BarSubType["DoubleRectangle"] = 1] = "DoubleRectangle";
    /**
     * Trapezoid bar, represented as a right-angle triangle; the bar fills from left to right, determined by the {@link Bar.value}, similar to a volume meter.
     */
    BarSubType[BarSubType["Trapezoid"] = 2] = "Trapezoid";
    /**
     * Trapezoid bar, represented by two right-angle triangles; the bar fills outwards from the centre of the bar, determined by the {@link Bar.value}. See {@link BarSubType.DoubleRectangle}.
     */
    BarSubType[BarSubType["DoubleTrapezoid"] = 3] = "DoubleTrapezoid";
    /**
     * Rounded rectangle bar; the bar fills from left to right, determined by the {@link Bar.value}, similar to a standard progress bar.
     */
    BarSubType[BarSubType["Groove"] = 4] = "Groove";
})(BarSubType || (BarSubType = {}));

/**
 * Defines the type of argument supplied by Stream Deck.
 */
var RegistrationParameter;
(function (RegistrationParameter) {
    /**
     * Identifies the argument that specifies the web socket port that Stream Deck is listening on.
     */
    RegistrationParameter["Port"] = "-port";
    /**
     * Identifies the argument that supplies information about the Stream Deck and the plugin.
     */
    RegistrationParameter["Info"] = "-info";
    /**
     * Identifies the argument that specifies the unique identifier that can be used when registering the plugin.
     */
    RegistrationParameter["PluginUUID"] = "-pluginUUID";
    /**
     * Identifies the argument that specifies the event to be sent to Stream Deck as part of the registration procedure.
     */
    RegistrationParameter["RegisterEvent"] = "-registerEvent";
})(RegistrationParameter || (RegistrationParameter = {}));

/**
 * Defines the target of a request, i.e. whether the request should update the Stream Deck hardware, Stream Deck software (application), or both, when calling `setImage` and `setState`.
 */
var Target;
(function (Target) {
    /**
     * Hardware and software should be updated as part of the request.
     */
    Target[Target["HardwareAndSoftware"] = 0] = "HardwareAndSoftware";
    /**
     * Hardware only should be updated as part of the request.
     */
    Target[Target["Hardware"] = 1] = "Hardware";
    /**
     * Software only should be updated as part of the request.
     */
    Target[Target["Software"] = 2] = "Software";
})(Target || (Target = {}));

/**
 * Provides information for a version, as parsed from a string denoted as a collection of numbers separated by a period, for example `1.45.2`, `4.0.2.13098`. Parsing is opinionated
 * and strings should strictly conform to the format `{major}[.{minor}[.{patch}[.{build}]]]`; version numbers that form the version are optional, and when `undefined` will default to
 * 0, for example the `minor`, `patch`, or `build` number may be omitted.
 *
 * NB: This implementation should be considered fit-for-purpose, and should be used sparing.
 */
class Version {
    /**
     * Build version number.
     */
    build;
    /**
     * Major version number.
     */
    major;
    /**
     * Minor version number.
     */
    minor;
    /**
     * Patch version number.
     */
    patch;
    /**
     * Initializes a new instance of the {@link Version} class.
     * @param value Value to parse the version from.
     */
    constructor(value) {
        const result = value.match(/^(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?(?:\.(0|[1-9]\d*))?(?:\.(0|[1-9]\d*))?$/);
        if (result === null) {
            throw new Error(`Invalid format; expected "{major}[.{minor}[.{patch}[.{build}]]]" but was "${value}"`);
        }
        [, this.major, this.minor, this.patch, this.build] = [...result.map((value) => parseInt(value) || 0)];
    }
    /**
     * Compares this instance to the {@link other} {@link Version}.
     * @param other The {@link Version} to compare to.
     * @returns `-1` when this instance is less than the {@link other}, `1` when this instance is greater than {@link other}, otherwise `0`.
     */
    compareTo(other) {
        const segments = ({ major, minor, build, patch }) => [major, minor, build, patch];
        const thisSegments = segments(this);
        const otherSegments = segments(other);
        for (let i = 0; i < 4; i++) {
            if (thisSegments[i] < otherSegments[i]) {
                return -1;
            }
            else if (thisSegments[i] > otherSegments[i]) {
                return 1;
            }
        }
        return 0;
    }
    /** @inheritdoc */
    toString() {
        return `${this.major}.${this.minor}`;
    }
}

/**
 * Provides a {@link LogTarget} that logs to the console.
 */
class ConsoleTarget {
    /**
     * @inheritdoc
     */
    write(entry) {
        switch (entry.level) {
            case "error":
                console.error(...entry.data);
                break;
            case "warn":
                console.warn(...entry.data);
                break;
            default:
                console.log(...entry.data);
        }
    }
}

// Remove any dependencies on node.
const EOL = "\n";
/**
 * Creates a new string log entry formatter.
 * @param opts Options that defines the type for the formatter.
 * @returns The string {@link LogEntryFormatter}.
 */
function stringFormatter(opts) {
    {
        return (entry) => {
            const { data, level, scope } = entry;
            let prefix = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} `;
            if (scope) {
                prefix += `${scope}: `;
            }
            return `${prefix}${reduce(data)}`;
        };
    }
}
/**
 * Stringifies the provided data parameters that make up the log entry.
 * @param data Data parameters.
 * @returns The data represented as a single `string`.
 */
function reduce(data) {
    let result = "";
    let previousWasError = false;
    for (const value of data) {
        // When the value is an error, write the stack.
        if (typeof value === "object" && value instanceof Error) {
            result += `${EOL}${value.stack}`;
            previousWasError = true;
            continue;
        }
        // When the previous was an error, write a new line.
        if (previousWasError) {
            result += EOL;
            previousWasError = false;
        }
        result += typeof value === "object" ? JSON.stringify(value) : value;
        result += " ";
    }
    return result.trimEnd();
}

/* eslint-disable @typescript-eslint/sort-type-constituents */
/**
 * Gets the priority of the specified log level as a number; low numbers signify a higher priority.
 * @param level Log level.
 * @returns The priority as a number.
 */
function defcon(level) {
    switch (level) {
        case "error":
            return 0;
        case "warn":
            return 1;
        case "info":
            return 2;
        case "debug":
            return 3;
        case "trace":
        default:
            return 4;
    }
}

/**
 * Logger capable of forwarding messages to a {@link LogTarget}.
 */
class Logger {
    /**
     * Backing field for the {@link Logger.level}.
     */
    #level;
    /**
     * Options that define the loggers behavior.
     */
    #options;
    /**
     * Scope associated with this {@link Logger}.
     */
    #scope;
    /**
     * Initializes a new instance of the {@link Logger} class.
     * @param opts Options that define the loggers behavior.
     */
    constructor(opts) {
        this.#options = { minimumLevel: "trace", ...opts };
        this.#scope = this.#options.scope === undefined || this.#options.scope.trim() === "" ? "" : this.#options.scope;
        if (typeof this.#options.level !== "function") {
            this.setLevel(this.#options.level);
        }
    }
    /**
     * Gets the {@link LogLevel}.
     * @returns The {@link LogLevel}.
     */
    get level() {
        if (this.#level !== undefined) {
            return this.#level;
        }
        return typeof this.#options.level === "function" ? this.#options.level() : this.#options.level;
    }
    /**
     * Creates a scoped logger with the given {@link scope}; logs created by scoped-loggers include their scope to enable their source to be easily identified.
     * @param scope Value that represents the scope of the new logger.
     * @returns The scoped logger, or this instance when {@link scope} is not defined.
     */
    createScope(scope) {
        scope = scope.trim();
        if (scope === "") {
            return this;
        }
        return new Logger({
            ...this.#options,
            level: () => this.level,
            scope: this.#options.scope ? `${this.#options.scope}->${scope}` : scope,
        });
    }
    /**
     * Writes the arguments as a debug log entry.
     * @param data Message or data to log.
     * @returns This instance for chaining.
     */
    debug(...data) {
        return this.write({ level: "debug", data, scope: this.#scope });
    }
    /**
     * Writes the arguments as error log entry.
     * @param data Message or data to log.
     * @returns This instance for chaining.
     */
    error(...data) {
        return this.write({ level: "error", data, scope: this.#scope });
    }
    /**
     * Writes the arguments as an info log entry.
     * @param data Message or data to log.
     * @returns This instance for chaining.
     */
    info(...data) {
        return this.write({ level: "info", data, scope: this.#scope });
    }
    /**
     * Sets the log-level that determines which logs should be written. The specified level will be inherited by all scoped loggers unless they have log-level explicitly defined.
     * @param level The log-level that determines which logs should be written; when `undefined`, the level will be inherited from the parent logger, or default to the environment level.
     * @returns This instance for chaining.
     */
    setLevel(level) {
        if (level !== undefined && defcon(level) > defcon(this.#options.minimumLevel)) {
            this.#level = "info";
        }
        else {
            this.#level = level;
        }
        return this;
    }
    /**
     * Writes the arguments as a trace log entry.
     * @param data Message or data to log.
     * @returns This instance for chaining.
     */
    trace(...data) {
        return this.write({ level: "trace", data, scope: this.#scope });
    }
    /**
     * Writes the arguments as a warning log entry.
     * @param data Message or data to log.
     * @returns This instance for chaining.
     */
    warn(...data) {
        return this.write({ level: "warn", data, scope: this.#scope });
    }
    /**
     * Writes the log entry.
     * @param entry Log entry to write.
     * @returns This instance for chaining.
     */
    write(entry) {
        if (defcon(entry.level) <= defcon(this.level)) {
            this.#options.targets.forEach((t) => t.write(entry));
        }
        return this;
    }
}

/**
 * Provides a {@link LogTarget} capable of logging to a local file system.
 */
class FileTarget {
    /**
     * File path where logs will be written.
     */
    #filePath;
    /**
     * Options that defines how logs should be written to the local file system.
     */
    #options;
    /**
     * Current size of the logs that have been written to the {@link FileTarget.#filePath}.
     */
    #size = 0;
    /**
     * Initializes a new instance of the {@link FileTarget} class.
     * @param options Options that defines how logs should be written to the local file system.
     */
    constructor(options) {
        this.#options = options;
        this.#filePath = this.getLogFilePath();
        this.reIndex();
    }
    /**
     * @inheritdoc
     */
    write(entry) {
        const fd = fs.openSync(this.#filePath, "a");
        try {
            const msg = this.#options.format(entry);
            fs.writeSync(fd, msg + "\n");
            this.#size += msg.length;
        }
        finally {
            fs.closeSync(fd);
        }
        if (this.#size >= this.#options.maxSize) {
            this.reIndex();
            this.#size = 0;
        }
    }
    /**
     * Gets the file path to an indexed log file.
     * @param index Optional index of the log file to be included as part of the file name.
     * @returns File path that represents the indexed log file.
     */
    getLogFilePath(index = 0) {
        return path.join(this.#options.dest, `${this.#options.fileName}.${index}.log`);
    }
    /**
     * Gets the log files associated with this file target, including past and present.
     * @returns Log file entries.
     */
    getLogFiles() {
        const regex = /^\.(\d+)\.log$/;
        return fs
            .readdirSync(this.#options.dest, { withFileTypes: true })
            .reduce((prev, entry) => {
            if (entry.isDirectory() || entry.name.indexOf(this.#options.fileName) < 0) {
                return prev;
            }
            const match = entry.name.substring(this.#options.fileName.length).match(regex);
            if (match?.length !== 2) {
                return prev;
            }
            prev.push({
                path: path.join(this.#options.dest, entry.name),
                index: parseInt(match[1]),
            });
            return prev;
        }, [])
            .sort(({ index: a }, { index: b }) => {
            return a < b ? -1 : a > b ? 1 : 0;
        });
    }
    /**
     * Re-indexes the existing log files associated with this file target, removing old log files whose index exceeds the {@link FileTargetOptions.maxFileCount}, and renaming the
     * remaining log files, leaving index "0" free for a new log file.
     */
    reIndex() {
        // When the destination directory is new, create it, and return.
        if (!fs.existsSync(this.#options.dest)) {
            fs.mkdirSync(this.#options.dest);
            return;
        }
        const logFiles = this.getLogFiles();
        for (let i = logFiles.length - 1; i >= 0; i--) {
            const log = logFiles[i];
            if (i >= this.#options.maxFileCount - 1) {
                fs.rmSync(log.path);
            }
            else {
                fs.renameSync(log.path, this.getLogFilePath(i + 1));
            }
        }
    }
}

let __isDebugMode = undefined;
/**
 * Determines whether the current plugin is running in a debug environment; this is determined by the command-line arguments supplied to the plugin by Stream. Specifically, the result
 * is `true` when  either `--inspect`, `--inspect-brk` or `--inspect-port` are present as part of the processes' arguments.
 * @returns `true` when the plugin is running in debug mode; otherwise `false`.
 */
function isDebugMode() {
    if (__isDebugMode === undefined) {
        __isDebugMode = process.execArgv.some((arg) => {
            const name = arg.split("=")[0];
            return name === "--inspect" || name === "--inspect-brk" || name === "--inspect-port";
        });
    }
    return __isDebugMode;
}
/**
 * Gets the plugin's unique-identifier from the current working directory.
 * @returns The plugin's unique-identifier.
 */
function getPluginUUID() {
    const name = path.basename(process.cwd());
    const suffixIndex = name.lastIndexOf(".sdPlugin");
    return suffixIndex < 0 ? name : name.substring(0, suffixIndex);
}

// Log all entires to a log file.
const fileTarget = new FileTarget({
    dest: path.join(node_process.cwd(), "logs"),
    fileName: getPluginUUID(),
    format: stringFormatter(),
    maxFileCount: 10,
    maxSize: 50 * 1024 * 1024,
});
// Construct the log targets.
const targets = [fileTarget];
if (isDebugMode()) {
    targets.splice(0, 0, new ConsoleTarget());
}
/**
 * Logger responsible for capturing log messages.
 */
const logger = new Logger({
    level: isDebugMode() ? "debug" : "info",
    minimumLevel: isDebugMode() ? "trace" : "debug",
    targets,
});
process.once("uncaughtException", (err) => logger.error("Process encountered uncaught exception", err));

/**
 * Provides a connection between the plugin and the Stream Deck allowing for messages to be sent and received.
 */
class Connection extends EventEmitter$1 {
    /**
     * Private backing field for {@link Connection.registrationParameters}.
     */
    _registrationParameters;
    /**
     * Private backing field for {@link Connection.version}.
     */
    _version;
    /**
     * Used to ensure {@link Connection.connect} is invoked as a singleton; `false` when a connection is occurring or established.
     */
    canConnect = true;
    /**
     * Underlying web socket connection.
     */
    connection = withResolvers();
    /**
     * Logger scoped to the connection.
     */
    logger = logger.createScope("Connection");
    /**
     * Underlying connection information provided to the plugin to establish a connection with Stream Deck.
     * @returns The registration parameters.
     */
    get registrationParameters() {
        return (this._registrationParameters ??= this.getRegistrationParameters());
    }
    /**
     * Version of Stream Deck this instance is connected to.
     * @returns The version.
     */
    get version() {
        return (this._version ??= new Version(this.registrationParameters.info.application.version));
    }
    /**
     * Establishes a connection with the Stream Deck, allowing for the plugin to send and receive messages.
     * @returns A promise that is resolved when a connection has been established.
     */
    async connect() {
        // Ensure we only establish a single connection.
        if (this.canConnect) {
            this.canConnect = false;
            const webSocket = new WebSocket$1(`ws://127.0.0.1:${this.registrationParameters.port}`);
            webSocket.onmessage = (ev) => this.tryEmit(ev);
            webSocket.onopen = () => {
                webSocket.send(JSON.stringify({
                    event: this.registrationParameters.registerEvent,
                    uuid: this.registrationParameters.pluginUUID,
                }));
                // Web socket established a connection with the Stream Deck and the plugin was registered.
                this.connection.resolve(webSocket);
                this.emit("connected", this.registrationParameters.info);
            };
        }
        await this.connection.promise;
    }
    /**
     * Sends the commands to the Stream Deck, once the connection has been established and registered.
     * @param command Command being sent.
     * @returns `Promise` resolved when the command is sent to Stream Deck.
     */
    async send(command) {
        const connection = await this.connection.promise;
        const message = JSON.stringify(command);
        this.logger.trace(message);
        connection.send(message);
    }
    /**
     * Gets the registration parameters, provided by Stream Deck, that provide information to the plugin, including how to establish a connection.
     * @returns Parsed registration parameters.
     */
    getRegistrationParameters() {
        const params = {
            port: undefined,
            info: undefined,
            pluginUUID: undefined,
            registerEvent: undefined,
        };
        const scopedLogger = logger.createScope("RegistrationParameters");
        for (let i = 0; i < process.argv.length - 1; i++) {
            const param = process.argv[i];
            const value = process.argv[++i];
            switch (param) {
                case RegistrationParameter.Port:
                    scopedLogger.debug(`port=${value}`);
                    params.port = value;
                    break;
                case RegistrationParameter.PluginUUID:
                    scopedLogger.debug(`pluginUUID=${value}`);
                    params.pluginUUID = value;
                    break;
                case RegistrationParameter.RegisterEvent:
                    scopedLogger.debug(`registerEvent=${value}`);
                    params.registerEvent = value;
                    break;
                case RegistrationParameter.Info:
                    scopedLogger.debug(`info=${value}`);
                    params.info = JSON.parse(value);
                    break;
                default:
                    i--;
                    break;
            }
        }
        const invalidArgs = [];
        const validate = (name, value) => {
            if (value === undefined) {
                invalidArgs.push(name);
            }
        };
        validate(RegistrationParameter.Port, params.port);
        validate(RegistrationParameter.PluginUUID, params.pluginUUID);
        validate(RegistrationParameter.RegisterEvent, params.registerEvent);
        validate(RegistrationParameter.Info, params.info);
        if (invalidArgs.length > 0) {
            throw new Error(`Unable to establish a connection with Stream Deck, missing command line arguments: ${invalidArgs.join(", ")}`);
        }
        return params;
    }
    /**
     * Attempts to emit the {@link ev} that was received from the {@link Connection.connection}.
     * @param ev Event message data received from Stream Deck.
     */
    tryEmit(ev) {
        try {
            const message = JSON.parse(ev.data.toString());
            if (message.event) {
                this.logger.trace(ev.data.toString());
                this.emit(message.event, message);
            }
            else {
                this.logger.warn(`Received unknown message: ${ev.data}`);
            }
        }
        catch (err) {
            this.logger.error(`Failed to parse message: ${ev.data}`, err);
        }
    }
}
const connection = new Connection();

/**
 * Provides information for events received from Stream Deck.
 */
class Event {
    /**
     * Event that occurred.
     */
    type;
    /**
     * Initializes a new instance of the {@link Event} class.
     * @param source Source of the event, i.e. the original message from Stream Deck.
     */
    constructor(source) {
        this.type = source.event;
    }
}

/**
 * Provides information for an event relating to an action.
 */
class ActionWithoutPayloadEvent extends Event {
    action;
    /**
     * Initializes a new instance of the {@link ActionWithoutPayloadEvent} class.
     * @param action Action that raised the event.
     * @param source Source of the event, i.e. the original message from Stream Deck.
     */
    constructor(action, source) {
        super(source);
        this.action = action;
    }
}
/**
 * Provides information for an event relating to an action.
 */
class ActionEvent extends ActionWithoutPayloadEvent {
    /**
     * Provides additional information about the event that occurred, e.g. how many `ticks` the dial was rotated, the current `state` of the action, etc.
     */
    payload;
    /**
     * Initializes a new instance of the {@link ActionEvent} class.
     * @param action Action that raised the event.
     * @param source Source of the event, i.e. the original message from Stream Deck.
     */
    constructor(action, source) {
        super(action, source);
        this.payload = source.payload;
    }
}

const manifest$1 = new Lazy(() => {
    const path$1 = path.join(process.cwd(), "manifest.json");
    if (!fs.existsSync(path$1)) {
        throw new Error("Failed to read manifest.json as the file does not exist.");
    }
    try {
        return JSON.parse(fs.readFileSync(path$1, {
            encoding: "utf-8",
            flag: "r",
        }).toString());
    }
    catch (e) {
        if (e instanceof SyntaxError) {
            return null;
        }
        else {
            throw e;
        }
    }
});
const softwareMinimumVersion = new Lazy(() => {
    if (manifest$1.value === null) {
        return null;
    }
    return new Version(manifest$1.value.Software.MinimumVersion);
});
/**
 * Gets the SDK version that the plugin requires.
 * @returns SDK version; otherwise `null` when the plugin is DRM protected.
 */
function getSDKVersion() {
    return manifest$1.value?.SDKVersion ?? null;
}
/**
 * Gets the minimum version that the plugin requires.
 * @returns Minimum required version; otherwise `null` when the plugin is DRM protected.
 */
function getSoftwareMinimumVersion() {
    return softwareMinimumVersion.value;
}
/**
 * Gets the manifest associated with the plugin.
 * @returns The manifest; otherwise `null` when the plugin is DRM protected.
 */
function getManifest() {
    return manifest$1.value;
}

const __items$1 = new Map();
/**
 * Provides a read-only store of Stream Deck devices.
 */
class ReadOnlyActionStore extends Enumerable {
    /**
     * Initializes a new instance of the {@link ReadOnlyActionStore}.
     */
    constructor() {
        super(__items$1);
    }
    /**
     * Gets the action with the specified identifier.
     * @param id Identifier of action to search for.
     * @returns The action, when present; otherwise `undefined`.
     */
    getActionById(id) {
        return __items$1.get(id);
    }
}
/**
 * Provides a store of Stream Deck actions.
 */
class ActionStore extends ReadOnlyActionStore {
    /**
     * Deletes the action from the store.
     * @param id The action's identifier.
     */
    delete(id) {
        __items$1.delete(id);
    }
    /**
     * Adds the action to the store.
     * @param action The action.
     */
    set(action) {
        __items$1.set(action.id, action);
    }
}
/**
 * Singleton instance of the action store.
 */
const actionStore = new ActionStore();

/**
 * Provides information for events relating to an application.
 */
class ApplicationEvent extends Event {
    /**
     * Monitored application that was launched/terminated.
     */
    application;
    /**
     * Initializes a new instance of the {@link ApplicationEvent} class.
     * @param source Source of the event, i.e. the original message from Stream Deck.
     */
    constructor(source) {
        super(source);
        this.application = source.payload.application;
    }
}

/**
 * Provides information for events relating to a device.
 */
class DeviceEvent extends Event {
    device;
    /**
     * Initializes a new instance of the {@link DeviceEvent} class.
     * @param source Source of the event, i.e. the original message from Stream Deck.
     * @param device Device that event is associated with.
     */
    constructor(source, device) {
        super(source);
        this.device = device;
    }
}

/**
 * Event information received from Stream Deck as part of a deep-link message being routed to the plugin.
 */
class DidReceiveDeepLinkEvent extends Event {
    /**
     * Deep-link URL routed from Stream Deck.
     */
    url;
    /**
     * Initializes a new instance of the {@link DidReceiveDeepLinkEvent} class.
     * @param source Source of the event, i.e. the original message from Stream Deck.
     */
    constructor(source) {
        super(source);
        this.url = new DeepLinkURL(source.payload.url);
    }
}
const PREFIX = "streamdeck://";
/**
 * Provides information associated with a URL received as part of a deep-link message, conforming to the URI syntax defined within RFC-3986 (https://datatracker.ietf.org/doc/html/rfc3986#section-3).
 */
class DeepLinkURL {
    /**
     * Fragment of the URL, with the number sign (#) omitted. For example, a URL of "/test#heading" would result in a {@link DeepLinkURL.fragment} of "heading".
     */
    fragment;
    /**
     * Original URL. For example, a URL of "/test?one=two#heading" would result in a {@link DeepLinkURL.href} of "/test?one=two#heading".
     */
    href;
    /**
     * Path of the URL; the full URL with the query and fragment omitted. For example, a URL of "/test?one=two#heading" would result in a {@link DeepLinkURL.path} of "/test".
     */
    path;
    /**
     * Query of the URL, with the question mark (?) omitted. For example, a URL of "/test?name=elgato&key=123" would result in a {@link DeepLinkURL.query} of "name=elgato&key=123".
     * See also {@link DeepLinkURL.queryParameters}.
     */
    query;
    /**
     * Query string parameters parsed from the URL. See also {@link DeepLinkURL.query}.
     */
    queryParameters;
    /**
     * Initializes a new instance of the {@link DeepLinkURL} class.
     * @param url URL of the deep-link, with the schema and authority omitted.
     */
    constructor(url) {
        const refUrl = new URL(`${PREFIX}${url}`);
        this.fragment = refUrl.hash.substring(1);
        this.href = refUrl.href.substring(PREFIX.length);
        this.path = DeepLinkURL.parsePath(this.href);
        this.query = refUrl.search.substring(1);
        this.queryParameters = refUrl.searchParams;
    }
    /**
     * Parses the {@link DeepLinkURL.path} from the specified {@link href}.
     * @param href Partial URL that contains the path to parse.
     * @returns The path of the URL.
     */
    static parsePath(href) {
        const indexOf = (char) => {
            const index = href.indexOf(char);
            return index >= 0 ? index : href.length;
        };
        return href.substring(0, Math.min(indexOf("?"), indexOf("#")));
    }
}

/**
 * Provides event information for when the plugin received the global settings.
 */
class DidReceiveGlobalSettingsEvent extends Event {
    /**
     * Settings associated with the event.
     */
    settings;
    /**
     * Initializes a new instance of the {@link DidReceiveGlobalSettingsEvent} class.
     * @param source Source of the event, i.e. the original message from Stream Deck.
     */
    constructor(source) {
        super(source);
        this.settings = source.payload.settings;
    }
}

/**
 * Provides information for an event triggered by a message being sent to the plugin, from the property inspector.
 */
class SendToPluginEvent extends Event {
    action;
    /**
     * Payload sent from the property inspector.
     */
    payload;
    /**
     * Initializes a new instance of the {@link SendToPluginEvent} class.
     * @param action Action that raised the event.
     * @param source Source of the event, i.e. the original message from Stream Deck.
     */
    constructor(action, source) {
        super(source);
        this.action = action;
        this.payload = source.payload;
    }
}

/**
 * Validates the `SDKVersion` within the manifest fulfils the minimum required version for the specified
 * feature; when the version is not fulfilled, an error is thrown with the feature formatted into the message.
 * @param minimumVersion Minimum required SDKVersion.
 * @param feature Feature that requires the version.
 */
function requiresSDKVersion(minimumVersion, feature) {
    const sdkVersion = getSDKVersion();
    if (sdkVersion !== null && minimumVersion > sdkVersion) {
        throw new Error(`[ERR_NOT_SUPPORTED]: ${feature} requires manifest SDK version ${minimumVersion} or higher, but found version ${sdkVersion}; please update the "SDKVersion" in the plugin's manifest to ${minimumVersion} or higher.`);
    }
}
/**
 * Validates the {@link streamDeckVersion} and manifest's `Software.MinimumVersion` are at least the {@link minimumVersion};
 * when the version is not fulfilled, an error is thrown with the {@link feature} formatted into the message.
 * @param minimumVersion Minimum required version.
 * @param streamDeckVersion Actual application version.
 * @param feature Feature that requires the version.
 */
function requiresVersion(minimumVersion, streamDeckVersion, feature) {
    const required = {
        major: Math.floor(minimumVersion),
        minor: Number(minimumVersion.toString().split(".").at(1) ?? 0), // Account for JavaScript's floating point precision.
        patch: 0,
        build: 0,
    };
    if (streamDeckVersion.compareTo(required) === -1) {
        throw new Error(`[ERR_NOT_SUPPORTED]: ${feature} requires Stream Deck version ${required.major}.${required.minor} or higher, but current version is ${streamDeckVersion.major}.${streamDeckVersion.minor}; please update Stream Deck and the "Software.MinimumVersion" in the plugin's manifest to "${required.major}.${required.minor}" or higher.`);
    }
    const softwareMinimumVersion = getSoftwareMinimumVersion();
    if (softwareMinimumVersion !== null && softwareMinimumVersion.compareTo(required) === -1) {
        throw new Error(`[ERR_NOT_SUPPORTED]: ${feature} requires Stream Deck version ${required.major}.${required.minor} or higher; please update the "Software.MinimumVersion" in the plugin's manifest to "${required.major}.${required.minor}" or higher.`);
    }
}

let __useExperimentalMessageIdentifiers = false;
const settings = {
    /**
     * Available from Stream Deck 7.1; determines whether message identifiers should be sent when getting
     * action-instance or global settings.
     *
     * When `true`, the did-receive events associated with settings are only emitted when the action-instance
     * or global settings are changed in the property inspector.
     * @returns The value.
     */
    get useExperimentalMessageIdentifiers() {
        return __useExperimentalMessageIdentifiers;
    },
    /**
     * Available from Stream Deck 7.1; determines whether message identifiers should be sent when getting
     * action-instance or global settings.
     *
     * When `true`, the did-receive events associated with settings are only emitted when the action-instance
     * or global settings are changed in the property inspector.
     */
    set useExperimentalMessageIdentifiers(value) {
        requiresVersion(7.1, connection.version, "Message identifiers");
        __useExperimentalMessageIdentifiers = value;
    },
    /**
     * Gets the global settings associated with the plugin.
     * @template T The type of global settings associated with the plugin.
     * @returns Promise containing the plugin's global settings.
     */
    getGlobalSettings: () => {
        return new Promise((resolve) => {
            connection.once("didReceiveGlobalSettings", (ev) => resolve(ev.payload.settings));
            connection.send({
                event: "getGlobalSettings",
                context: connection.registrationParameters.pluginUUID,
                id: node_crypto.randomUUID(),
            });
        });
    },
    /**
     * Occurs when the global settings are requested, or when the the global settings were updated in
     * the property inspector.
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that removes the listener.
     */
    onDidReceiveGlobalSettings: (listener) => {
        return connection.disposableOn("didReceiveGlobalSettings", (ev) => {
            // Do nothing when the global settings were requested.
            if (settings.useExperimentalMessageIdentifiers && ev.id) {
                return;
            }
            listener(new DidReceiveGlobalSettingsEvent(ev));
        });
    },
    /**
     * Occurs when the settings associated with an action instance are requested, or when the the settings
     * were updated in the property inspector.
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that removes the listener.
     */
    onDidReceiveSettings: (listener) => {
        return connection.disposableOn("didReceiveSettings", (ev) => {
            // Do nothing when the action's settings were requested.
            if (settings.useExperimentalMessageIdentifiers && ev.id) {
                return;
            }
            const action = actionStore.getActionById(ev.context);
            if (action) {
                listener(new ActionEvent(action, ev));
            }
        });
    },
    /**
     * Sets the global settings associated the plugin; these settings are only available to this plugin,
     * and should be used to persist information securely.
     * @param settings Settings to save.
     * @example
     * streamDeck.settings.setGlobalSettings({
     *   apiKey,
     *   connectedDate: new Date()
     * })
     */
    setGlobalSettings: async (settings) => {
        await connection.send({
            event: "setGlobalSettings",
            context: connection.registrationParameters.pluginUUID,
            payload: settings,
        });
    },
};

/**
 * Controller capable of sending/receiving payloads with the property inspector, and listening for events.
 */
class UIController {
    /**
     * Action associated with the current property inspector.
     */
    #action;
    /**
     * To overcome event races, the debounce counter keeps track of appear vs disappear events, ensuring
     * we only clear the current ui when an equal number of matching disappear events occur.
     */
    #appearanceStackCount = 0;
    /**
     * Initializes a new instance of the {@link UIController} class.
     */
    constructor() {
        // Track the action for the current property inspector.
        this.onDidAppear((ev) => {
            if (this.#isCurrent(ev.action)) {
                this.#appearanceStackCount++;
            }
            else {
                this.#appearanceStackCount = 1;
                this.#action = ev.action;
            }
        });
        this.onDidDisappear((ev) => {
            if (this.#isCurrent(ev.action)) {
                this.#appearanceStackCount--;
                if (this.#appearanceStackCount <= 0) {
                    this.#action = undefined;
                }
            }
        });
    }
    /**
     * Gets the action associated with the current property.
     * @returns The action; otherwise `undefined` when a property inspector is not visible.
     */
    get action() {
        return this.#action;
    }
    /**
     * Occurs when the property inspector associated with the action becomes visible, i.e. the user
     * selected an action in the Stream Deck application..
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onDidAppear(listener) {
        return connection.disposableOn("propertyInspectorDidAppear", (ev) => {
            const action = actionStore.getActionById(ev.context);
            if (action) {
                listener(new ActionWithoutPayloadEvent(action, ev));
            }
        });
    }
    /**
     * Occurs when the property inspector associated with the action disappears, i.e. the user unselected
     * the action in the Stream Deck application.
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onDidDisappear(listener) {
        return connection.disposableOn("propertyInspectorDidDisappear", (ev) => {
            const action = actionStore.getActionById(ev.context);
            if (action) {
                listener(new ActionWithoutPayloadEvent(action, ev));
            }
        });
    }
    /**
     * Occurs when a message was sent to the plugin _from_ the property inspector.
     * @template TPayload The type of the payload received from the property inspector.
     * @template TSettings The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onSendToPlugin(listener) {
        return connection.disposableOn("sendToPlugin", (ev) => {
            const action = actionStore.getActionById(ev.context);
            if (action) {
                listener(new SendToPluginEvent(action, ev));
            }
        });
    }
    /**
     * Sends the payload to the property inspector; the payload is only sent when the property inspector
     * is visible for an action provided by this plugin.
     * @param payload Payload to send.
     */
    async sendToPropertyInspector(payload) {
        if (this.#action) {
            await connection.send({
                event: "sendToPropertyInspector",
                context: this.#action.id,
                payload,
            });
        }
    }
    /**
     * Determines whether the specified action is the action for the current property inspector.
     * @param action Action to check against.
     * @returns `true` when the actions are the same.
     */
    #isCurrent(action) {
        return (this.#action?.id === action.id &&
            this.#action?.manifestId === action.manifestId &&
            this.#action?.device?.id === action.device.id);
    }
}
const ui = new UIController();

const __items = new Map();
/**
 * Provides a read-only store of Stream Deck devices.
 */
class ReadOnlyDeviceStore extends Enumerable {
    /**
     * Initializes a new instance of the {@link ReadOnlyDeviceStore}.
     */
    constructor() {
        super(__items);
    }
    /**
     * Gets the Stream Deck {@link Device} associated with the specified {@link deviceId}.
     * @param deviceId Identifier of the Stream Deck device.
     * @returns The Stream Deck device information; otherwise `undefined` if a device with the {@link deviceId} does not exist.
     */
    getDeviceById(deviceId) {
        return __items.get(deviceId);
    }
}
/**
 * Provides a store of Stream Deck devices.
 */
class DeviceStore extends ReadOnlyDeviceStore {
    /**
     * Adds the device to the store.
     * @param device The device.
     */
    set(device) {
        __items.set(device.id, device);
    }
}
/**
 * Singleton instance of the device store.
 */
const deviceStore = new DeviceStore();

/**
 * Provides information about an instance of a Stream Deck action.
 */
class ActionContext {
    /**
     * Device the action is associated with.
     */
    #device;
    /**
     * Source of the action.
     */
    #source;
    /**
     * Initializes a new instance of the {@link ActionContext} class.
     * @param source Source of the action.
     */
    constructor(source) {
        this.#source = source;
        const device = deviceStore.getDeviceById(source.device);
        if (!device) {
            throw new Error(`Failed to initialize action; device ${source.device} not found`);
        }
        this.#device = device;
    }
    /**
     * Type of the action.
     * - `Keypad` is a key.
     * - `Encoder` is a dial and portion of the touch strip.
     * @returns Controller type.
     */
    get controllerType() {
        return this.#source.payload.controller;
    }
    /**
     * Stream Deck device the action is positioned on.
     * @returns Stream Deck device.
     */
    get device() {
        return this.#device;
    }
    /**
     * Action instance identifier.
     * @returns Identifier.
     */
    get id() {
        return this.#source.context;
    }
    /**
     * Manifest identifier (UUID) for this action type.
     * @returns Manifest identifier.
     */
    get manifestId() {
        return this.#source.action;
    }
    /**
     * Converts this instance to a serializable object.
     * @returns The serializable object.
     */
    toJSON() {
        return {
            controllerType: this.controllerType,
            device: this.device,
            id: this.id,
            manifestId: this.manifestId,
        };
    }
}

const REQUEST_TIMEOUT = 15 * 1000; // 15s
/**
 * Provides a contextualized instance of an {@link Action}, allowing for direct communication with the Stream Deck.
 * @template T The type of settings associated with the action.
 */
class Action extends ActionContext {
    /**
     * Gets the resources (files) associated with this action; these resources are embedded into the
     * action when it is exported, either individually, or as part of a profile.
     *
     * Available from Stream Deck 7.1.
     * @returns The resources.
     */
    async getResources() {
        requiresVersion(7.1, connection.version, "getResources");
        const res = await this.#fetch("getResources", "didReceiveResources");
        return res.payload.resources;
    }
    /**
     * Gets the settings associated this action instance.
     * @template U The type of settings associated with the action.D
     * @returns Promise containing the action instance's settings.
     */
    async getSettings() {
        const res = await this.#fetch("getSettings", "didReceiveSettings");
        return res.payload.settings;
    }
    /**
     * Determines whether this instance is a dial.
     * @returns `true` when this instance is a dial; otherwise `false`.
     */
    isDial() {
        return this.controllerType === "Encoder";
    }
    /**
     * Determines whether this instance is a key.
     * @returns `true` when this instance is a key; otherwise `false`.
     */
    isKey() {
        return this.controllerType === "Keypad";
    }
    /**
     * Sets the resources (files) associated with this action; these resources are embedded into the
     * action when it is exported, either individually, or as part of a profile.
     *
     * Available from Stream Deck 7.1.
     * @example
     * action.setResources({
     *   fileOne: "c:\\hello-world.txt",
     *   anotherFile: "c:\\icon.png"
     * });
     * @param resources The resources as a map of file paths.
     * @returns `Promise` resolved when the resources are saved to Stream Deck.
     */
    setResources(resources) {
        requiresVersion(7.1, connection.version, "setResources");
        return connection.send({
            event: "setResources",
            context: this.id,
            payload: resources,
        });
    }
    /**
     * Sets the {@link settings} associated with this action instance. Use in conjunction with {@link Action.getSettings}.
     * @param settings Settings to persist.
     * @returns `Promise` resolved when the {@link settings} are sent to Stream Deck.
     */
    setSettings(settings) {
        return connection.send({
            event: "setSettings",
            context: this.id,
            payload: settings,
        });
    }
    /**
     * Temporarily shows an alert (i.e. warning), in the form of an exclamation mark in a yellow triangle, on this action instance. Used to provide visual feedback when an action failed.
     * @returns `Promise` resolved when the request to show an alert has been sent to Stream Deck.
     */
    showAlert() {
        return connection.send({
            event: "showAlert",
            context: this.id,
        });
    }
    /**
     * Fetches information from Stream Deck by sending the command, and awaiting the event.
     * @param command Name of the event (command) to send.
     * @param event Name of the event to await.
     * @returns The payload from the received event.
     */
    async #fetch(command, event) {
        const { resolve, reject, promise } = withResolvers();
        // Set a timeout to prevent endless awaiting.
        const timeoutId = setTimeout(() => {
            listener.dispose();
            reject("The request timed out");
        }, REQUEST_TIMEOUT);
        // Listen for an event that can resolve the request.
        const listener = connection.disposableOn(event, (ev) => {
            // Make sure the received event is for this action.
            if (ev.context == this.id) {
                clearTimeout(timeoutId);
                listener.dispose();
                resolve(ev);
            }
        });
        // Send the request; specifying an id signifies its a request.
        await connection.send({
            event: command,
            context: this.id,
            id: node_crypto.randomUUID(),
        });
        return promise;
    }
}

/**
 * Provides a contextualized instance of a dial action.
 * @template T The type of settings associated with the action.
 */
class DialAction extends Action {
    /**
     * Private backing field for {@link DialAction.coordinates}.
     */
    #coordinates;
    /**
     * Initializes a new instance of the {@see DialAction} class.
     * @param source Source of the action.
     */
    constructor(source) {
        super(source);
        if (source.payload.controller !== "Encoder") {
            throw new Error("Unable to create DialAction; source event is not a Encoder");
        }
        this.#coordinates = Object.freeze(source.payload.coordinates);
    }
    /**
     * Coordinates of the dial.
     * @returns The coordinates.
     */
    get coordinates() {
        return this.#coordinates;
    }
    /**
     * Sets the feedback for the current layout associated with this action instance, allowing for the visual items to be updated. Layouts are a powerful way to provide dynamic information
     * to users, and can be assigned in the manifest, or dynamically via {@link Action.setFeedbackLayout}.
     *
     * The {@link feedback} payload defines which items within the layout will be updated, and are identified by their property name (defined as the `key` in the layout's definition).
     * The values can either by a complete new definition, a `string` for layout item types of `text` and `pixmap`, or a `number` for layout item types of `bar` and `gbar`.
     * @param feedback Object containing information about the layout items to be updated.
     * @returns `Promise` resolved when the request to set the {@link feedback} has been sent to Stream Deck.
     */
    setFeedback(feedback) {
        return connection.send({
            event: "setFeedback",
            context: this.id,
            payload: feedback,
        });
    }
    /**
     * Sets the layout associated with this action instance. The layout must be either a built-in layout identifier, or path to a local layout JSON file within the plugin's folder.
     * Use in conjunction with {@link Action.setFeedback} to update the layout's current items' settings.
     * @param layout Name of a pre-defined layout, or relative path to a custom one.
     * @returns `Promise` resolved when the new layout has been sent to Stream Deck.
     */
    setFeedbackLayout(layout) {
        return connection.send({
            event: "setFeedbackLayout",
            context: this.id,
            payload: {
                layout,
            },
        });
    }
    /**
     * Sets the {@link image} to be display for this action instance within Stream Deck app.
     *
     * NB: The image can only be set by the plugin when the the user has not specified a custom image.
     * @param image Image to display; this can be either a path to a local file within the plugin's folder, a base64 encoded `string` with the mime type declared (e.g. PNG, JPEG, etc.),
     * or an SVG `string`. When `undefined`, the image from the manifest will be used.
     * @returns `Promise` resolved when the request to set the {@link image} has been sent to Stream Deck.
     */
    setImage(image) {
        return connection.send({
            event: "setImage",
            context: this.id,
            payload: {
                image,
            },
        });
    }
    /**
     * Sets the {@link title} displayed for this action instance.
     *
     * NB: The title can only be set by the plugin when the the user has not specified a custom title.
     * @param title Title to display.
     * @returns `Promise` resolved when the request to set the {@link title} has been sent to Stream Deck.
     */
    setTitle(title) {
        return this.setFeedback({ title });
    }
    /**
     * Sets the trigger (interaction) {@link descriptions} associated with this action instance. Descriptions are shown within the Stream Deck application, and informs the user what
     * will happen when they interact with the action, e.g. rotate, touch, etc. When {@link descriptions} is `undefined`, the descriptions will be reset to the values provided as part
     * of the manifest.
     *
     * NB: Applies to encoders (dials / touchscreens) found on Stream Deck + devices.
     * @param descriptions Descriptions that detail the action's interaction.
     * @returns `Promise` resolved when the request to set the {@link descriptions} has been sent to Stream Deck.
     */
    setTriggerDescription(descriptions) {
        return connection.send({
            event: "setTriggerDescription",
            context: this.id,
            payload: descriptions || {},
        });
    }
    /**
     * @inheritdoc
     */
    toJSON() {
        return {
            ...super.toJSON(),
            coordinates: this.coordinates,
        };
    }
}

/**
 * Provides a contextualized instance of a key action.
 * @template T The type of settings associated with the action.
 */
class KeyAction extends Action {
    /**
     * Private backing field for {@link KeyAction.coordinates}.
     */
    #coordinates;
    /**
     * Source of the action.
     */
    #source;
    /**
     * Initializes a new instance of the {@see KeyAction} class.
     * @param source Source of the action.
     */
    constructor(source) {
        super(source);
        if (source.payload.controller !== "Keypad") {
            throw new Error("Unable to create KeyAction; source event is not a Keypad");
        }
        this.#coordinates = !source.payload.isInMultiAction ? Object.freeze(source.payload.coordinates) : undefined;
        this.#source = source;
    }
    /**
     * Coordinates of the key; otherwise `undefined` when the action is part of a multi-action.
     * @returns The coordinates.
     */
    get coordinates() {
        return this.#coordinates;
    }
    /**
     * Determines whether the key is part of a multi-action.
     * @returns `true` when in a multi-action; otherwise `false`.
     */
    isInMultiAction() {
        return this.#source.payload.isInMultiAction;
    }
    /**
     * Sets the {@link image} to be display for this action instance.
     *
     * NB: The image can only be set by the plugin when the the user has not specified a custom image.
     * @param image Image to display; this can be either a path to a local file within the plugin's folder, a base64 encoded `string` with the mime type declared (e.g. PNG, JPEG, etc.),
     * or an SVG `string`. When `undefined`, the image from the manifest will be used.
     * @param options Additional options that define where and how the image should be rendered.
     * @returns `Promise` resolved when the request to set the {@link image} has been sent to Stream Deck.
     */
    setImage(image, options) {
        return connection.send({
            event: "setImage",
            context: this.id,
            payload: {
                image,
                ...options,
            },
        });
    }
    /**
     * Sets the current {@link state} of this action instance; only applies to actions that have multiple states defined within the manifest.
     * @param state State to set; this be either 0, or 1.
     * @returns `Promise` resolved when the request to set the state of an action instance has been sent to Stream Deck.
     */
    setState(state) {
        return connection.send({
            event: "setState",
            context: this.id,
            payload: {
                state,
            },
        });
    }
    /**
     * Sets the {@link title} displayed for this action instance.
     *
     * NB: The title can only be set by the plugin when the the user has not specified a custom title.
     * @param title Title to display; when `undefined` the title within the manifest will be used.
     * @param options Additional options that define where and how the title should be rendered.
     * @returns `Promise` resolved when the request to set the {@link title} has been sent to Stream Deck.
     */
    setTitle(title, options) {
        return connection.send({
            event: "setTitle",
            context: this.id,
            payload: {
                title,
                ...options,
            },
        });
    }
    /**
     * Temporarily shows an "OK" (i.e. success), in the form of a check-mark in a green circle, on this action instance. Used to provide visual feedback when an action successfully
     * executed.
     * @returns `Promise` resolved when the request to show an "OK" has been sent to Stream Deck.
     */
    showOk() {
        return connection.send({
            event: "showOk",
            context: this.id,
        });
    }
    /**
     * @inheritdoc
     */
    toJSON() {
        return {
            ...super.toJSON(),
            coordinates: this.coordinates,
            isInMultiAction: this.isInMultiAction(),
        };
    }
}

const manifest = new Lazy(() => getManifest());
/**
 * Provides functions, and information, for interacting with Stream Deck actions.
 */
class ActionService extends ReadOnlyActionStore {
    /**
     * Initializes a new instance of the {@link ActionService} class.
     */
    constructor() {
        super();
        // Adds the action to the store.
        connection.prependListener("willAppear", (ev) => {
            const action = ev.payload.controller === "Encoder" ? new DialAction(ev) : new KeyAction(ev);
            actionStore.set(action);
        });
        // Remove the action from the store.
        connection.prependListener("willDisappear", (ev) => actionStore.delete(ev.context));
    }
    /**
     * Occurs when the user presses a dial (Stream Deck +).
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onDialDown(listener) {
        return connection.disposableOn("dialDown", (ev) => {
            const action = actionStore.getActionById(ev.context);
            if (action?.isDial()) {
                listener(new ActionEvent(action, ev));
            }
        });
    }
    /**
     * Occurs when the user rotates a dial (Stream Deck +).
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onDialRotate(listener) {
        return connection.disposableOn("dialRotate", (ev) => {
            const action = actionStore.getActionById(ev.context);
            if (action?.isDial()) {
                listener(new ActionEvent(action, ev));
            }
        });
    }
    /**
     * Occurs when the user releases a pressed dial (Stream Deck +).
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onDialUp(listener) {
        return connection.disposableOn("dialUp", (ev) => {
            const action = actionStore.getActionById(ev.context);
            if (action?.isDial()) {
                listener(new ActionEvent(action, ev));
            }
        });
    }
    /**
     * Occurs when the resources were updated within the property inspector.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onDidReceiveResources(listener) {
        return connection.disposableOn("didReceiveResources", (ev) => {
            // When the id is defined, the resources were requested, so we don't propagate the event.
            if (ev.id !== undefined) {
                return;
            }
            const action = actionStore.getActionById(ev.context);
            if (action) {
                listener(new ActionEvent(action, ev));
            }
        });
    }
    /**
     * Occurs when the user presses a action down.
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onKeyDown(listener) {
        return connection.disposableOn("keyDown", (ev) => {
            const action = actionStore.getActionById(ev.context);
            if (action?.isKey()) {
                listener(new ActionEvent(action, ev));
            }
        });
    }
    /**
     * Occurs when the user releases a pressed action.
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onKeyUp(listener) {
        return connection.disposableOn("keyUp", (ev) => {
            const action = actionStore.getActionById(ev.context);
            if (action?.isKey()) {
                listener(new ActionEvent(action, ev));
            }
        });
    }
    /**
     * Occurs when the user updates an action's title settings in the Stream Deck application. See also {@link Action.setTitle}.
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onTitleParametersDidChange(listener) {
        return connection.disposableOn("titleParametersDidChange", (ev) => {
            const action = actionStore.getActionById(ev.context);
            if (action) {
                listener(new ActionEvent(action, ev));
            }
        });
    }
    /**
     * Occurs when the user taps the touchscreen (Stream Deck +).
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onTouchTap(listener) {
        return connection.disposableOn("touchTap", (ev) => {
            const action = actionStore.getActionById(ev.context);
            if (action?.isDial()) {
                listener(new ActionEvent(action, ev));
            }
        });
    }
    /**
     * Occurs when an action appears on the Stream Deck due to the user navigating to another page, profile, folder, etc. This also occurs during startup if the action is on the "front
     * page". An action refers to _all_ types of actions, e.g. keys, dials,
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onWillAppear(listener) {
        return connection.disposableOn("willAppear", (ev) => {
            const action = actionStore.getActionById(ev.context);
            if (action) {
                listener(new ActionEvent(action, ev));
            }
        });
    }
    /**
     * Occurs when an action disappears from the Stream Deck due to the user navigating to another page, profile, folder, etc. An action refers to _all_ types of actions, e.g. keys,
     * dials, touchscreens, pedals, etc.
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onWillDisappear(listener) {
        return connection.disposableOn("willDisappear", (ev) => listener(new ActionEvent(new ActionContext(ev), ev)));
    }
    /**
     * Registers the action with the Stream Deck, routing all events associated with the {@link SingletonAction.manifestId} to the specified {@link action}.
     * @param action The action to register.
     * @example
     * ＠action({ UUID: "com.elgato.test.action" })
     * class MyCustomAction extends SingletonAction {
     *     export function onKeyDown(ev: KeyDownEvent) {
     *         // Do some awesome thing.
     *     }
     * }
     *
     * streamDeck.actions.registerAction(new MyCustomAction());
     */
    registerAction(action) {
        if (action.manifestId === undefined) {
            throw new Error("The action's manifestId cannot be undefined.");
        }
        if (manifest.value !== null && !manifest.value.Actions.some((a) => a.UUID === action.manifestId)) {
            throw new Error(`The action's manifestId was not found within the manifest: ${action.manifestId}`);
        }
        // Routes an event to the action, when the applicable listener is defined on the action.
        const { manifestId } = action;
        const route = (fn, listener) => {
            const boundedListener = listener?.bind(action);
            if (boundedListener === undefined) {
                return;
            }
            fn.bind(action)(async (ev) => {
                if (ev.action.manifestId == manifestId) {
                    await boundedListener(ev);
                }
            });
        };
        // Route each of the action events.
        route(this.onDialDown, action.onDialDown);
        route(this.onDialUp, action.onDialUp);
        route(this.onDialRotate, action.onDialRotate);
        route(ui.onSendToPlugin, action.onSendToPlugin);
        route(this.onDidReceiveResources, action.onDidReceiveResources);
        route(settings.onDidReceiveSettings, action.onDidReceiveSettings);
        route(this.onKeyDown, action.onKeyDown);
        route(this.onKeyUp, action.onKeyUp);
        route(ui.onDidAppear, action.onPropertyInspectorDidAppear);
        route(ui.onDidDisappear, action.onPropertyInspectorDidDisappear);
        route(this.onTitleParametersDidChange, action.onTitleParametersDidChange);
        route(this.onTouchTap, action.onTouchTap);
        route(this.onWillAppear, action.onWillAppear);
        route(this.onWillDisappear, action.onWillDisappear);
    }
}
/**
 * Service for interacting with Stream Deck actions.
 */
const actionService = new ActionService();

/**
 * Provides information about a device.
 */
class Device {
    /**
     * Private backing field for {@link Device.isConnected}.
     */
    #isConnected = false;
    /**
     * Private backing field for the device's information.
     */
    #info;
    /**
     * Unique identifier of the device.
     */
    id;
    /**
     * Initializes a new instance of the {@link Device} class.
     * @param id Device identifier.
     * @param info Information about the device.
     * @param isConnected Determines whether the device is connected.
     */
    constructor(id, info, isConnected) {
        this.id = id;
        this.#info = info;
        this.#isConnected = isConnected;
        // Set connected.
        connection.prependListener("deviceDidConnect", (ev) => {
            if (ev.device === this.id) {
                this.#info = ev.deviceInfo;
                this.#isConnected = true;
            }
        });
        // Track changes.
        connection.prependListener("deviceDidChange", (ev) => {
            if (ev.device === this.id) {
                this.#info = ev.deviceInfo;
            }
        });
        // Set disconnected.
        connection.prependListener("deviceDidDisconnect", (ev) => {
            if (ev.device === this.id) {
                this.#isConnected = false;
            }
        });
    }
    /**
     * Actions currently visible on the device.
     * @returns Collection of visible actions.
     */
    get actions() {
        return actionStore.filter((a) => a.device.id === this.id);
    }
    /**
     * Determines whether the device is currently connected.
     * @returns `true` when the device is connected; otherwise `false`.
     */
    get isConnected() {
        return this.#isConnected;
    }
    /**
     * Name of the device, as specified by the user in the Stream Deck application.
     * @returns Name of the device.
     */
    get name() {
        return this.#info.name;
    }
    /**
     * Number of action slots, excluding dials / touchscreens, available to the device.
     * @returns Size of the device.
     */
    get size() {
        return this.#info.size;
    }
    /**
     * Type of the device that was connected, e.g. Stream Deck +, Stream Deck Pedal, etc. See {@link DeviceType}.
     * @returns Type of the device.
     */
    get type() {
        return this.#info.type;
    }
}

/**
 * Provides functions, and information, for interacting with Stream Deck actions.
 */
class DeviceService extends ReadOnlyDeviceStore {
    /**
     * Initializes a new instance of the {@link DeviceService}.
     */
    constructor() {
        super();
        // Add the devices from registration parameters.
        connection.once("connected", (info) => {
            info.devices.forEach((dev) => deviceStore.set(new Device(dev.id, dev, false)));
        });
        // Add new devices that were connected.
        connection.on("deviceDidConnect", ({ device: id, deviceInfo }) => {
            if (!deviceStore.getDeviceById(id)) {
                deviceStore.set(new Device(id, deviceInfo, true));
            }
        });
        // Add new devices that were changed (Virtual Stream Deck event race).
        connection.on("deviceDidChange", ({ device: id, deviceInfo }) => {
            if (!deviceStore.getDeviceById(id)) {
                deviceStore.set(new Device(id, deviceInfo, false));
            }
        });
    }
    /**
     * Occurs when a Stream Deck device changed, for example its name or size.
     *
     * Available from Stream Deck 7.0.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onDeviceDidChange(listener) {
        requiresVersion(7.0, connection.version, "onDeviceDidChange");
        return connection.disposableOn("deviceDidChange", (ev) => listener(new DeviceEvent(ev, this.getDeviceById(ev.device))));
    }
    /**
     * Occurs when a Stream Deck device is connected. See also {@link DeviceService.onDeviceDidConnect}.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onDeviceDidConnect(listener) {
        return connection.disposableOn("deviceDidConnect", (ev) => listener(new DeviceEvent(ev, this.getDeviceById(ev.device))));
    }
    /**
     * Occurs when a Stream Deck device is disconnected. See also {@link DeviceService.onDeviceDidDisconnect}.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onDeviceDidDisconnect(listener) {
        return connection.disposableOn("deviceDidDisconnect", (ev) => listener(new DeviceEvent(ev, this.getDeviceById(ev.device))));
    }
}
/**
 * Provides functions, and information, for interacting with Stream Deck actions.
 */
const deviceService = new DeviceService();

/**
 * Loads a locale from the file system.
 * @param language Language to load.
 * @returns Contents of the locale.
 */
function fileSystemLocaleProvider(language) {
    const filePath = path.join(process.cwd(), `${language}.json`);
    if (!fs.existsSync(filePath)) {
        return null;
    }
    try {
        // Parse the translations from the file.
        const contents = fs.readFileSync(filePath, { flag: "r" })?.toString();
        return parseLocalizations(contents);
    }
    catch (err) {
        logger.error(`Failed to load translations from ${filePath}`, err);
        return null;
    }
}
/**
 * Parses the localizations from the specified contents, or throws a `TypeError` when unsuccessful.
 * @param contents Contents that represent the stringified JSON containing the localizations.
 * @returns The localizations; otherwise a `TypeError`.
 */
function parseLocalizations(contents) {
    const json = JSON.parse(contents);
    if (json !== undefined && json !== null && typeof json === "object" && "Localization" in json) {
        return json["Localization"];
    }
    throw new TypeError(`Translations must be a JSON object nested under a property named "Localization"`);
}

/**
 * Requests the Stream Deck switches the current profile of the specified {@link deviceId} to the {@link profile}; when no {@link profile} is provided the previously active profile
 * is activated.
 *
 * NB: Plugins may only switch to profiles distributed with the plugin, as defined within the manifest, and cannot access user-defined profiles.
 * @param deviceId Unique identifier of the device where the profile should be set.
 * @param profile Optional name of the profile to switch to; when `undefined` the previous profile will be activated. Name must be identical to the one provided in the manifest.
 * @param page Optional page to show when switching to the {@link profile}, indexed from 0. When `undefined`, the page that was previously visible (when switching away from the
 * profile) will be made visible.
 * @returns `Promise` resolved when the request to switch the `profile` has been sent to Stream Deck.
 */
function switchToProfile(deviceId, profile, page) {
    if (page !== undefined) {
        requiresVersion(6.5, connection.version, "Switching to a profile page");
    }
    return connection.send({
        event: "switchToProfile",
        context: connection.registrationParameters.pluginUUID,
        device: deviceId,
        payload: {
            page,
            profile,
        },
    });
}

var profiles = /*#__PURE__*/Object.freeze({
    __proto__: null,
    switchToProfile: switchToProfile
});

/**
 * Occurs when a monitored application is launched. Monitored applications can be defined in the manifest via the {@link Manifest.ApplicationsToMonitor} property.
 * See also {@link onApplicationDidTerminate}.
 * @param listener Function to be invoked when the event occurs.
 * @returns A disposable that, when disposed, removes the listener.
 */
function onApplicationDidLaunch(listener) {
    return connection.disposableOn("applicationDidLaunch", (ev) => listener(new ApplicationEvent(ev)));
}
/**
 * Occurs when a monitored application terminates. Monitored applications can be defined in the manifest via the {@link Manifest.ApplicationsToMonitor} property.
 * See also {@link onApplicationDidLaunch}.
 * @param listener Function to be invoked when the event occurs.
 * @returns A disposable that, when disposed, removes the listener.
 */
function onApplicationDidTerminate(listener) {
    return connection.disposableOn("applicationDidTerminate", (ev) => listener(new ApplicationEvent(ev)));
}
/**
 * Occurs when a deep-link message is routed to the plugin from Stream Deck. One-way deep-link messages can be sent to plugins from external applications using the URL format
 * `streamdeck://plugins/message/<PLUGIN_UUID>/{MESSAGE}`.
 * @param listener Function to be invoked when the event occurs.
 * @returns A disposable that, when disposed, removes the listener.
 */
function onDidReceiveDeepLink(listener) {
    requiresVersion(6.5, connection.version, "Receiving deep-link messages");
    return connection.disposableOn("didReceiveDeepLink", (ev) => listener(new DidReceiveDeepLinkEvent(ev)));
}
/**
 * Occurs when the computer wakes up.
 * @param listener Function to be invoked when the event occurs.
 * @returns A disposable that, when disposed, removes the listener.
 */
function onSystemDidWakeUp(listener) {
    return connection.disposableOn("systemDidWakeUp", (ev) => listener(new Event(ev)));
}
/**
 * Opens the specified `url` in the user's default browser.
 * @param url URL to open.
 * @returns `Promise` resolved when the request to open the `url` has been sent to Stream Deck.
 */
function openUrl(url) {
    return connection.send({
        event: "openUrl",
        payload: {
            url,
        },
    });
}
/**
 * Gets the secrets associated with the plugin.
 * @returns `Promise` resolved with the secrets associated with the plugin.
 */
function getSecrets() {
    requiresVersion(6.9, connection.version, "Secrets");
    requiresSDKVersion(3, "Secrets");
    return new Promise((resolve) => {
        connection.once("didReceiveSecrets", (ev) => resolve(ev.payload.secrets));
        connection.send({
            event: "getSecrets",
            context: connection.registrationParameters.pluginUUID,
        });
    });
}

var system = /*#__PURE__*/Object.freeze({
    __proto__: null,
    getSecrets: getSecrets,
    onApplicationDidLaunch: onApplicationDidLaunch,
    onApplicationDidTerminate: onApplicationDidTerminate,
    onDidReceiveDeepLink: onDidReceiveDeepLink,
    onSystemDidWakeUp: onSystemDidWakeUp,
    openUrl: openUrl
});

/**
 * Defines a Stream Deck action associated with the plugin.
 * @param definition The definition of the action, e.g. it's identifier, name, etc.
 * @returns The definition decorator.
 */
function action(definition) {
    const manifestId = definition.UUID;
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-unused-vars
    return function (target, context) {
        return class extends target {
            /**
             * The universally-unique value that identifies the action within the manifest.
             */
            manifestId = manifestId;
        };
    };
}

/**
 * Provides the main bridge between the plugin and the Stream Deck allowing the plugin to send requests and receive events, e.g. when the user presses an action.
 * @template T The type of settings associated with the action.
 */
class SingletonAction {
    /**
     * The universally-unique value that identifies the action within the manifest.
     */
    manifestId;
    /**
     * Gets the visible actions with the `manifestId` that match this instance's.
     * @returns The visible actions.
     */
    get actions() {
        return actionStore.filter((a) => a.manifestId === this.manifestId);
    }
}

let i18n;
const streamDeck = {
    /**
     * Namespace for event listeners and functionality relating to Stream Deck actions.
     * @returns Actions namespace.
     */
    get actions() {
        return actionService;
    },
    /**
     * Namespace for interacting with Stream Deck devices.
     * @returns Devices namespace.
     */
    get devices() {
        return deviceService;
    },
    /**
     * Internalization provider, responsible for managing localizations and translating resources.
     * @returns Internalization provider.
     */
    get i18n() {
        return (i18n ??= new I18nProvider(this.info.application.language, fileSystemLocaleProvider));
    },
    /**
     * Registration and application information provided by Stream Deck during initialization.
     * @returns Registration information.
     */
    get info() {
        return connection.registrationParameters.info;
    },
    /**
     * Logger responsible for capturing log messages.
     * @returns The logger.
     */
    get logger() {
        return logger;
    },
    /**
     * Namespace for Stream Deck profiles.
     * @returns Profiles namespace.
     */
    get profiles() {
        return profiles;
    },
    /**
     * Namespace for persisting settings within Stream Deck.
     * @returns Settings namespace.
     */
    get settings() {
        return settings;
    },
    /**
     * Namespace for interacting with, and receiving events from, the system the plugin is running on.
     * @returns System namespace.
     */
    get system() {
        return system;
    },
    /**
     * Namespace for interacting with UI (property inspector) associated with the plugin.
     * @returns UI namespace.
     */
    get ui() {
        return ui;
    },
    /**
     * Connects the plugin to the Stream Deck.
     * @returns A promise resolved when a connection has been established.
     */
    connect() {
        return connection.connect();
    },
};

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise, SuppressedError, Symbol, Iterator */


function __esDecorate(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
}
function __runInitializers(thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
}
typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};

const WINDOWS_10_BUILD = 10240;
const isWindows = process.platform === "win32";
const windowsBuild = isWindows ? parseInt(os.release().split(".")[2] || "0", 10) : 0;
const osSupported = isWindows && windowsBuild >= WINDOWS_10_BUILD;
const POLL_INTERVAL_MS = 1000;
const CPU_MEM_INTERVAL_MS = POLL_INTERVAL_MS;
const DISK_PERF_INTERVAL_MS = 1000;
const FS_SIZE_CACHE_MS = 60 * 1000; // 60 seconds - disk space updates slowly
const NET_IFACE_CACHE_MS = 60 * 60 * 1000; // 1 hour - NICs rarely change
const GPU_CACHE_MS = 1000;
const NET_STATS_CACHE_MS = 1000;
const NET_HISTORY_MINUTE_MS = 60 * 1000;
const MAX_NET_HISTORY_SECONDS_MS = 60 * 1000;
const MAX_NET_HISTORY_MINUTES_MS = 24 * 60 * 60 * 1000;
const NET_HISTORY_PERSIST_MS = 60 * 1000;
const NET_HISTORY_PATHS = (() => {
    const pluginDir = path.resolve(__dirname, "..");
    return [path.join(pluginDir, "net-history.json")];
})();
let activeNetHistoryPath = null;
const PERF_LOG_INTERVAL_MS = 30 * 1000;
const PERF_SLOW_TICK_MS = 200;
const PERF_LOG_ROTATE_BYTES = 100 * 1024 * 1024;
const PERF_LOG_ROTATE_CHECK_MS = 10 * 1000;
let perfLogRotateAt = 0;
const HELPER_INTERVAL_MS = 1000;
const HELPER_STALE_MS = 5000;
const HELPER_STARTUP_MS = 15000;
const HELPER_RETRY_DELAY_MS = 5000;
const HELPER_EXE_NAME = "SimpleStatsHelper.exe";
const HELPER_PATHS = (() => {
    const paths = [];
    const pluginDir = path.resolve(__dirname, "..");
    paths.push(path.join(pluginDir, "bin", HELPER_EXE_NAME));
    paths.push(path.join(process.cwd(), "bin", HELPER_EXE_NAME));
    paths.push(path.join(process.cwd(), HELPER_EXE_NAME));
    return paths;
})();
const perfLogPaths = (() => {
    const pluginDir = path.resolve(__dirname, "..");
    return [path.join(pluginDir, "debug.log")];
})();
let activePerfLogPath = null;
function rotatePerfLogIfNeeded(candidate) {
    const now = Date.now();
    if (now - perfLogRotateAt < PERF_LOG_ROTATE_CHECK_MS)
        return;
    perfLogRotateAt = now;
    try {
        if (!fs.existsSync(candidate))
            return;
        const stats = fs.statSync(candidate);
        if (stats.size < PERF_LOG_ROTATE_BYTES)
            return;
        fs.truncateSync(candidate, 0);
    }
    catch {
        // Ignore rotation errors.
    }
}
function writePerfLog(message, data) {
    try {
        const stamp = new Date().toISOString();
        const payload = data ? ` ${JSON.stringify(data)}` : "";
        const line = `${stamp} ${message}${payload}\n`;
        const candidates = activePerfLogPath ? [activePerfLogPath] : perfLogPaths;
        for (const candidate of candidates) {
            try {
                const dir = path.dirname(candidate);
                fs.mkdirSync(dir, { recursive: true });
                rotatePerfLogIfNeeded(candidate);
                fs.appendFileSync(candidate, line);
                activePerfLogPath = candidate;
                return;
            }
            catch {
                // Try the next path.
            }
        }
    }
    catch {
        // Swallow logging errors to avoid impacting the plugin.
    }
}
function readNetHistory() {
    for (const candidate of NET_HISTORY_PATHS) {
        try {
            if (!fs.existsSync(candidate))
                continue;
            const text = fs.readFileSync(candidate, "utf8");
            const payload = JSON.parse(text);
            const historyMinutes = payload?.historyMinutes;
            const historyLegacy = payload?.history;
            const history = historyMinutes ?? historyLegacy;
            if (!history || typeof history !== "object" || Array.isArray(history)) {
                continue;
            }
            const normalized = {
                version: typeof payload?.version === "number" ? payload.version : 1,
                savedAt: typeof payload?.savedAt === "number" ? payload.savedAt : 0,
                historyMinutes: history
            };
            activeNetHistoryPath = candidate;
            return { payload: normalized, legacy: !historyMinutes && !!historyLegacy };
        }
        catch {
            // Try the next path.
        }
    }
    return null;
}
async function writeNetHistory(payload) {
    const text = JSON.stringify(payload);
    const candidates = activeNetHistoryPath ? [activeNetHistoryPath] : NET_HISTORY_PATHS;
    for (const candidate of candidates) {
        try {
            const dir = path.dirname(candidate);
            await fs.promises.mkdir(dir, { recursive: true });
            await fs.promises.writeFile(candidate, text, "utf8");
            activeNetHistoryPath = candidate;
            return true;
        }
        catch {
            // Try the next path.
        }
    }
    return false;
}
const METRIC_GROUPS = ["cpu", "gpu", "memory", "disk", "network", "system"];
function isMetricGroup$1(value) {
    return METRIC_GROUPS.includes(value);
}
function emptySnapshot() {
    return {
        osSupported,
        cpu: {
            total: null,
            cores: null
        },
        memUsedPct: null,
        memUsedBytes: null,
        memTotalBytes: null,
        gpus: [],
        disks: [],
        diskThroughput: {
            readBps: null,
            writeBps: null
        },
        diskActivityPct: null,
        diskPerfById: {},
        netIfaces: [],
        net: {
            interfaces: [],
            total: {
                iface: "total",
                rxBps: null,
                txBps: null,
                rxBytes: null,
                txBytes: null
            }
        },
        topProcess: {
            cpuName: null,
            cpuPct: null,
            memName: null,
            memMB: null,
            cpuIconBase64: null,
            memIconBase64: null
        }
    };
}
function toPercent(value) {
    if (value === null || value === undefined || !Number.isFinite(value))
        return null;
    return Math.max(0, Math.min(100, value));
}
function toNumber(value) {
    if (value === null || value === undefined || !Number.isFinite(value))
        return null;
    return value;
}
function parseNumberFromText(value) {
    if (!value)
        return null;
    const cleaned = value.toString().trim();
    if (cleaned.length === 0)
        return null;
    const num = parseFloat(cleaned.replace(/[^\d.+-]/g, ""));
    return Number.isFinite(num) ? num : null;
}
function parseNumberFromUnknown(value) {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value === "string")
        return parseNumberFromText(value);
    return null;
}
class SimpleStatsHelper {
    static MAX_BUFFER_SIZE = 65536;
    child = null;
    buffer = "";
    disabled = false;
    latest = null;
    lastSampleAt = 0;
    startedAt = 0;
    isPrimed = false;
    helperPath = null;
    retryAfter = 0;
    snapshotCount = 0;
    ensureRunning() {
        if (this.disabled)
            return false;
        if (this.child)
            return true;
        if (this.retryAfter > 0 && Date.now() < this.retryAfter) {
            return false;
        }
        this.retryAfter = 0;
        if (!this.helperPath) {
            this.helperPath = this.findHelperPath();
        }
        if (!this.helperPath) {
            this.disabled = true;
            writePerfLog("helperMissing", { paths: HELPER_PATHS });
            return false;
        }
        try {
            const child = node_child_process.spawn(this.helperPath, ["--interval", String(HELPER_INTERVAL_MS)], { windowsHide: true });
            this.child = child;
            this.startedAt = Date.now();
            this.snapshotCount = 0;
            writePerfLog("helperStarted", { path: this.helperPath, pid: child.pid });
        }
        catch {
            this.disabled = true;
            this.child = null;
            return false;
        }
        const child = this.child;
        if (!child?.stdout) {
            this.disabled = true;
            this.child = null;
            return false;
        }
        child.stdout.on("data", (chunk) => this.handleChunk(chunk));
        child.stderr?.on("data", (chunk) => {
            writePerfLog("helperStderr", { message: chunk.toString().trim() });
        });
        child.on("error", () => {
            if (this.child !== child)
                return;
            this.disabled = true;
            this.stop();
        });
        child.on("exit", () => {
            if (this.child === child) {
                this.child = null;
            }
        });
        return true;
    }
    stop() {
        if (this.child) {
            const proc = this.child;
            this.child = null;
            try {
                proc.kill();
            }
            catch {
                // already dead
            }
            writePerfLog("helperStopped", { pid: proc.pid });
        }
    }
    getSnapshot() {
        if (!this.isPrimed)
            return null;
        return this.latest;
    }
    shouldFallback(now = Date.now()) {
        if (this.disabled)
            return true;
        if (!this.child)
            return true;
        if (this.lastSampleAt > 0) {
            if (now - this.lastSampleAt > HELPER_STALE_MS) {
                this.latest = null;
                this.isPrimed = false;
                this.lastSampleAt = 0;
                this.startedAt = 0;
                this.retryAfter = now + HELPER_RETRY_DELAY_MS;
                this.stop();
                return true;
            }
            return false;
        }
        if (this.startedAt > 0 && now - this.startedAt > HELPER_STARTUP_MS) {
            this.latest = null;
            this.isPrimed = false;
            this.lastSampleAt = 0;
            this.startedAt = 0;
            this.retryAfter = now + HELPER_RETRY_DELAY_MS;
            this.stop();
            return true;
        }
        return false;
    }
    findHelperPath() {
        for (const candidate of HELPER_PATHS) {
            try {
                if (fs.existsSync(candidate)) {
                    return candidate;
                }
            }
            catch {
                // Ignore filesystem errors.
            }
        }
        return null;
    }
    handleChunk(chunk) {
        const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
        this.buffer += text;
        if (this.buffer.length > SimpleStatsHelper.MAX_BUFFER_SIZE) {
            writePerfLog(`helperBufferExceeded ${SimpleStatsHelper.MAX_BUFFER_SIZE}`);
            this.buffer = this.buffer.slice(-65536);
        }
        let idx = this.buffer.indexOf("\n");
        while (idx >= 0) {
            const line = this.buffer.slice(0, idx).trim();
            this.buffer = this.buffer.slice(idx + 1);
            if (line.length > 0) {
                this.handleLine(line.replace(/\r$/, ""));
            }
            idx = this.buffer.indexOf("\n");
        }
    }
    handleLine(line) {
        try {
            const payload = JSON.parse(line);
            const parsed = parseHelperSnapshot(payload);
            if (parsed) {
                this.latest = parsed;
                this.lastSampleAt = Date.now();
                this.snapshotCount++;
                if (!this.isPrimed) {
                    this.isPrimed = true;
                    writePerfLog("helperPrimed", { elapsedMs: Date.now() - this.startedAt });
                }
                if (this.snapshotCount <= 5) {
                    writePerfLog("helperSnapshot", {
                        seq: this.snapshotCount,
                        hasCpu: !!parsed.cpu,
                        hasMem: !!parsed.mem,
                        hasGpus: !!parsed.gpus && parsed.gpus.length > 0,
                        hasDiskPerf: !!parsed.diskPerf,
                        hasTopProcess: !!parsed.topProcess,
                        itemCount: parsed.items.length
                    });
                }
            }
        }
        catch {
            // Ignore malformed lines.
        }
    }
}
function parseHelperSnapshot(payload) {
    if (!payload || typeof payload !== "object")
        return null;
    const tRaw = payload.t;
    const itemsRaw = payload.items;
    const disksRaw = payload.disks;
    const cpuRaw = payload.cpu;
    const diskPerfRaw = payload.diskPerf;
    const memRaw = payload.mem;
    const gpusRaw = payload.gpus;
    const topProcessRaw = payload.topProcess;
    const t = typeof tRaw === "number" && Number.isFinite(tRaw) ? tRaw : Date.now();
    if (!Array.isArray(itemsRaw))
        return null;
    const items = [];
    for (const item of itemsRaw) {
        if (!item || typeof item !== "object")
            continue;
        const iface = typeof item.iface === "string" ? item.iface : "";
        const rxBytes = Number(item.rxBytes);
        const txBytes = Number(item.txBytes);
        if (!iface || !Number.isFinite(rxBytes) || !Number.isFinite(txBytes))
            continue;
        items.push({
            iface,
            name: typeof item.name === "string" ? item.name : undefined,
            id: typeof item.id === "string" ? item.id : undefined,
            rxBytes,
            txBytes,
            status: typeof item.status === "string" ? item.status : undefined,
            type: typeof item.type === "string" ? item.type : undefined
        });
    }
    const disks = [];
    if (Array.isArray(disksRaw)) {
        for (const item of disksRaw) {
            if (!item || typeof item !== "object")
                continue;
            const id = typeof item.id === "string" ? item.id : "";
            const mount = typeof item.mount === "string" ? item.mount : "";
            const fs = typeof item.fs === "string" ? item.fs : "";
            const totalBytes = Number(item.totalBytes);
            const freeBytes = Number(item.freeBytes);
            if (!id || !Number.isFinite(totalBytes) || !Number.isFinite(freeBytes))
                continue;
            disks.push({
                id,
                mount: mount || id,
                fs,
                totalBytes,
                freeBytes,
                label: typeof item.label === "string" ? item.label : undefined
            });
        }
    }
    let cpu = null;
    if (cpuRaw && typeof cpuRaw === "object") {
        const total = parseNumberFromUnknown(cpuRaw.total);
        const coresRaw = cpuRaw.cores;
        let cores = null;
        if (Array.isArray(coresRaw)) {
            cores = coresRaw.map((value) => parseNumberFromUnknown(value) ?? 0);
        }
        cpu = { total, cores };
    }
    let mem = null;
    if (memRaw && typeof memRaw === "object") {
        const totalBytes = parseNumberFromUnknown(memRaw.totalBytes);
        const usedBytes = parseNumberFromUnknown(memRaw.usedBytes);
        if (typeof totalBytes === "number" && typeof usedBytes === "number") {
            mem = { totalBytes, usedBytes };
        }
    }
    let gpus = null;
    if (Array.isArray(gpusRaw)) {
        const list = [];
        for (let i = 0; i < gpusRaw.length; i += 1) {
            const raw = gpusRaw[i];
            if (!raw || typeof raw !== "object")
                continue;
            const index = parseNumberFromUnknown(raw.index) ?? i;
            const name = typeof raw.name === "string" ? raw.name : `GPU ${index + 1}`;
            const topComputeName = typeof raw.topComputeName === "string"
                ? raw.topComputeName : null;
            const topComputeIconBase64 = typeof raw.topComputeIconBase64 === "string"
                ? raw.topComputeIconBase64 : null;
            list.push({
                index,
                name,
                loadPct: parseNumberFromUnknown(raw.loadPct),
                vramTotalBytes: parseNumberFromUnknown(raw.vramTotalBytes),
                vramUsedBytes: parseNumberFromUnknown(raw.vramUsedBytes),
                tempC: parseNumberFromUnknown(raw.tempC),
                powerW: parseNumberFromUnknown(raw.powerW),
                topComputeName,
                topComputePct: parseNumberFromUnknown(raw.topComputePct),
                topComputeIconBase64
            });
        }
        gpus = list;
    }
    let diskPerf = null;
    if (diskPerfRaw && typeof diskPerfRaw === "object") {
        const totalRaw = diskPerfRaw.total;
        const itemsRawPerf = diskPerfRaw.items;
        const parseItem = (raw) => {
            if (!raw || typeof raw !== "object")
                return null;
            const id = typeof raw.id === "string" ? raw.id : "";
            if (!id)
                return null;
            return {
                id,
                activePct: parseNumberFromUnknown(raw.activePct),
                readBps: parseNumberFromUnknown(raw.readBps),
                writeBps: parseNumberFromUnknown(raw.writeBps)
            };
        };
        const totalItem = totalRaw ? parseItem(totalRaw) : null;
        const items = [];
        if (Array.isArray(itemsRawPerf)) {
            for (const item of itemsRawPerf) {
                const parsed = parseItem(item);
                if (parsed)
                    items.push(parsed);
            }
        }
        diskPerf = { total: totalItem, items };
    }
    let topProcess = null;
    if (topProcessRaw && typeof topProcessRaw === "object") {
        const cpuName = typeof topProcessRaw.cpuName === "string"
            ? topProcessRaw.cpuName : null;
        const cpuPct = parseNumberFromUnknown(topProcessRaw.cpuPct);
        const memName = typeof topProcessRaw.memName === "string"
            ? topProcessRaw.memName : null;
        const memMB = parseNumberFromUnknown(topProcessRaw.memMB);
        const cpuIconBase64 = typeof topProcessRaw.cpuIconBase64 === "string"
            ? topProcessRaw.cpuIconBase64 : null;
        const memIconBase64 = typeof topProcessRaw.memIconBase64 === "string"
            ? topProcessRaw.memIconBase64 : null;
        topProcess = { cpuName, cpuPct, memName, memMB, cpuIconBase64, memIconBase64 };
    }
    return { t, items, disks, cpu, diskPerf, mem, gpus, topProcess };
}
function normalizeDiskId$1(value) {
    const trimmed = (value ?? "").trim();
    if (!trimmed)
        return "";
    const upper = trimmed.toUpperCase();
    if (/^[A-Z]$/.test(upper))
        return `${upper}:`;
    return upper;
}
function mapNetStatsSample(stat) {
    return {
        iface: stat.iface,
        rxBps: toNumber(stat.rx_sec),
        txBps: toNumber(stat.tx_sec),
        rxBytes: toNumber(stat.rx_bytes),
        txBytes: toNumber(stat.tx_bytes)
    };
}
function sumNet(stats) {
    let rxBps = 0;
    let txBps = 0;
    let rxBytes = 0;
    let txBytes = 0;
    let has = false;
    for (const item of stats) {
        if (typeof item.rxBps === "number") {
            rxBps += item.rxBps;
            has = true;
        }
        if (typeof item.txBps === "number") {
            txBps += item.txBps;
            has = true;
        }
        if (typeof item.rxBytes === "number") {
            rxBytes += item.rxBytes;
            has = true;
        }
        if (typeof item.txBytes === "number") {
            txBytes += item.txBytes;
            has = true;
        }
    }
    return {
        iface: "total",
        rxBps: has ? rxBps : null,
        txBps: has ? txBps : null,
        rxBytes: has ? rxBytes : null,
        txBytes: has ? txBytes : null
    };
}
class StatsPoller {
    subscribers = new Map();
    timer;
    lastSubscriptionCleanupAt = 0;
    snapshot = emptySnapshot();
    netHistorySeconds = new Map();
    netHistoryMinutes = new Map();
    netHistoryDirty = false;
    netHistoryPersistAt = 0;
    netHistoryWritePending = false;
    netHistoryWriteTimer;
    perfStats = new Map();
    perfLastLogAt = 0;
    perfProcessLastAt = 0;
    perfProcessLastCpu = null;
    cpuMemAt = 0;
    cpuMemInFlight = null;
    gpuPollInFlight = null;
    diskPerfAt = 0;
    diskPerfInFlight = null;
    diskSizeInFlight = null;
    netStatsInFlight = null;
    netIfacesInFlight = null;
    actionGroups = new Map();
    groupCounts = {
        cpu: 0,
        gpu: 0,
        memory: 0,
        disk: 0,
        network: 0,
        system: 0
    };
    fsSizeCache = null;
    fsSizeAt = 0;
    netIfacesCache = null;
    netIfacesAt = 0;
    netStatsCache = null;
    netStatsAt = 0;
    helperSampleAt = 0;
    helperLastByIface = new Map();
    helperFailed = false;
    helperCpuMissing = false;
    helperDiskPerfMissing = false;
    helperMemMissing = false;
    helperGpuMissing = false;
    gpuPollAt = 0;
    helper = new SimpleStatsHelper();
    constructor() {
        this.loadNetHistory();
    }
    subscribe(handler) {
        const metadata = {
            callback: handler,
            lastCalledAt: Date.now()
        };
        this.subscribers.set(handler, metadata);
        if (this.subscribers.size === 1) {
            this.start();
        }
        handler(this.snapshot);
        return () => {
            this.subscribers.delete(handler);
            if (this.subscribers.size === 0) {
                this.stop();
            }
        };
    }
    getSnapshot() {
        return this.snapshot;
    }
    setInterest(actionId, group) {
        if (!isMetricGroup$1(group))
            return;
        const prev = this.actionGroups.get(actionId);
        if (prev === group)
            return;
        if (prev) {
            this.actionGroups.delete(actionId);
            this.updateGroupCount(prev, -1);
        }
        this.actionGroups.set(actionId, group);
        this.updateGroupCount(group, 1);
    }
    clearInterest(actionId) {
        const prev = this.actionGroups.get(actionId);
        if (!prev)
            return;
        this.actionGroups.delete(actionId);
        this.updateGroupCount(prev, -1);
    }
    async refreshNow(options) {
        await this.tick(options);
        return this.snapshot;
    }
    getNetworkTransfer(periodSec, iface) {
        const key = iface && iface.length > 0 ? iface : "total";
        const history = periodSec <= 60 ? this.netHistorySeconds.get(key) : this.netHistoryMinutes.get(key);
        if (!history || history.length === 0) {
            return { rxBytes: null, txBytes: null, totalBytes: null };
        }
        if (history.length < 2) {
            return { rxBytes: 0, txBytes: 0, totalBytes: 0 };
        }
        const cutoff = Date.now() - periodSec * 1000;
        let start = history[0];
        for (const entry of history) {
            if (entry.t <= cutoff) {
                start = entry;
                continue;
            }
            start = entry;
            break;
        }
        const end = history[history.length - 1];
        if (end.t < start.t) {
            return { rxBytes: 0, txBytes: 0, totalBytes: 0 };
        }
        const rxBytes = Math.max(0, end.rx - start.rx);
        const txBytes = Math.max(0, end.tx - start.tx);
        return {
            rxBytes,
            txBytes,
            totalBytes: rxBytes + txBytes
        };
    }
    updateGroupCount(group, delta) {
        const prev = this.groupCounts[group];
        const next = Math.max(0, prev + delta);
        this.groupCounts[group] = next;
        if (prev === 0 && next > 0) {
            this.onGroupActivated(group);
        }
        else if (prev > 0 && next === 0) {
            this.onGroupDeactivated(group);
        }
    }
    onGroupActivated(group) {
        if (group === "disk") {
            this.fsSizeAt = 0;
        }
        if (group === "network" || group === "disk") {
            if (group === "network") {
                this.netIfacesAt = 0;
                this.netStatsAt = 0;
            }
            this.helperFailed = false;
            this.helperCpuMissing = false;
            this.helperDiskPerfMissing = false;
            this.helperMemMissing = false;
            this.helperGpuMissing = false;
        }
        if (group === "cpu") {
            this.helperFailed = false;
            this.helperCpuMissing = false;
            this.helperDiskPerfMissing = false;
            this.helperMemMissing = false;
            this.helperGpuMissing = false;
        }
        if (group === "memory" || group === "gpu") {
            this.helperFailed = false;
            this.helperCpuMissing = false;
            this.helperDiskPerfMissing = false;
            this.helperMemMissing = false;
            this.helperGpuMissing = false;
        }
    }
    onGroupDeactivated(group) {
        if (group === "network" || group === "disk" || group === "cpu") {
            if (this.groupCounts.network === 0 && this.groupCounts.disk === 0 && this.groupCounts.cpu === 0) {
                this.helper.stop();
                this.netStatsCache = null;
                this.netIfacesCache = null;
                this.fsSizeCache = null;
                this.helperLastByIface.clear();
                this.helperSampleAt = 0;
            }
        }
    }
    isGroupActive(group) {
        return this.groupCounts[group] > 0;
    }
    start() {
        if (this.timer)
            return;
        this.timer = setInterval(() => {
            void this.tick();
        }, POLL_INTERVAL_MS);
        void this.tick();
    }
    stop() {
        if (!this.timer)
            return;
        clearInterval(this.timer);
        this.timer = undefined;
        void this.persistNetHistory(true);
        this.helper.stop();
    }
    emit(snapshot) {
        const now = Date.now();
        for (const metadata of this.subscribers.values()) {
            try {
                metadata.callback(snapshot);
            }
            catch (err) {
                writePerfLog("subscriberCallbackError", { error: String(err) });
            }
            metadata.lastCalledAt = now;
        }
        // Periodic subscription cleanup (every 5 minutes)
        if (now - this.lastSubscriptionCleanupAt > 5 * 60 * 1000) {
            this.cleanupStaleSubscriptions(now);
            this.lastSubscriptionCleanupAt = now;
        }
    }
    cleanupStaleSubscriptions(now) {
        const staleThreshold = 10 * 60 * 1000; // 10 minutes
        const deadSubs = [];
        for (const [handler, metadata] of this.subscribers.entries()) {
            if (now - metadata.lastCalledAt > staleThreshold) {
                deadSubs.push(handler);
            }
        }
        if (deadSubs.length > 0) {
            writePerfLog(`Cleaning up ${deadSubs.length} stale subscription(s)`);
            for (const handler of deadSubs) {
                this.subscribers.delete(handler);
            }
        }
    }
    getHelperSnapshot() {
        if (!this.helper.ensureRunning()) {
            this.markHelperFailed("helperUnavailable");
            return null;
        }
        const snapshot = this.helper.getSnapshot();
        if (!snapshot) {
            if (this.helper.shouldFallback()) {
                this.markHelperFailed("helperNoData");
            }
            return null;
        }
        return snapshot;
    }
    markHelperFailed(message) {
        if (!this.helperFailed) {
            this.helperFailed = true;
            writePerfLog(message);
        }
    }
    getFsSizeCached(force = false) {
        const now = Date.now();
        const snapshot = this.getHelperSnapshot();
        if (!snapshot) {
            this.fsSizeCache = null;
            return null;
        }
        if (!force && this.fsSizeCache && snapshot.t <= this.helperSampleAt && now - this.fsSizeAt < FS_SIZE_CACHE_MS) {
            return this.fsSizeCache;
        }
        const next = this.buildFsSizeFromHelper(snapshot);
        this.fsSizeCache = next;
        this.fsSizeAt = now;
        return next;
    }
    getNetIfacesCached(force = false) {
        const now = Date.now();
        if (!force && this.netIfacesCache && now - this.netIfacesAt < NET_IFACE_CACHE_MS) {
            return this.netIfacesCache;
        }
        const snapshot = this.getHelperSnapshot();
        if (!snapshot) {
            this.netIfacesCache = null;
            return null;
        }
        const next = this.buildNetIfacesFromHelper(snapshot);
        this.netIfacesCache = next;
        this.netIfacesAt = now;
        return next;
    }
    getNetStatsCached(force = false) {
        const now = Date.now();
        const snapshot = this.getHelperSnapshot();
        if (!snapshot) {
            this.netStatsCache = null;
            return null;
        }
        if (!force && this.netStatsCache && snapshot.t <= this.helperSampleAt && now - this.netStatsAt < NET_STATS_CACHE_MS) {
            return this.netStatsCache;
        }
        const next = this.buildNetStatsFromHelper(snapshot);
        this.netStatsCache = next;
        this.netStatsAt = now;
        return next;
    }
    buildNetStatsFromHelper(snapshot) {
        const stats = [];
        const now = snapshot.t;
        const seen = new Set();
        for (const item of snapshot.items) {
            const iface = item.iface;
            seen.add(iface);
            const prev = this.helperLastByIface.get(iface);
            let rx_sec = null;
            let tx_sec = null;
            if (prev && now > prev.t) {
                const deltaMs = now - prev.t;
                const rxDelta = item.rxBytes - prev.rxBytes;
                const txDelta = item.txBytes - prev.txBytes;
                if (rxDelta >= 0) {
                    rx_sec = rxDelta / (deltaMs / 1000);
                }
                if (txDelta >= 0) {
                    tx_sec = txDelta / (deltaMs / 1000);
                }
            }
            stats.push({
                iface,
                rx_sec,
                tx_sec,
                rx_bytes: item.rxBytes,
                tx_bytes: item.txBytes
            });
            this.helperLastByIface.set(iface, { rxBytes: item.rxBytes, txBytes: item.txBytes, t: now });
        }
        for (const key of this.helperLastByIface.keys()) {
            if (!seen.has(key)) {
                this.helperLastByIface.delete(key);
            }
        }
        this.helperSampleAt = now;
        return stats;
    }
    buildFsSizeFromHelper(snapshot) {
        const disks = [];
        for (const disk of snapshot.disks) {
            const total = Number(disk.totalBytes);
            const free = Number(disk.freeBytes);
            if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(free))
                continue;
            const used = Math.max(0, total - free);
            const usePct = total > 0 ? (used / total) * 100 : null;
            const mount = disk.mount || disk.id;
            const fs = disk.fs || mount;
            disks.push({
                fs,
                mount,
                size: total,
                use: usePct
            });
        }
        this.helperSampleAt = snapshot.t;
        return disks;
    }
    buildNetIfacesFromHelper(snapshot) {
        const items = [];
        for (const item of snapshot.items) {
            const name = item.name || item.iface;
            const type = (item.type || "").toLowerCase();
            const nameLower = name.toLowerCase();
            const internal = type.includes("loopback");
            const virtual = type.includes("tunnel") ||
                nameLower.includes("virtual") ||
                nameLower.includes("hyper-v") ||
                nameLower.includes("vmware") ||
                nameLower.includes("loopback");
            items.push({
                iface: item.iface,
                ifaceName: name,
                internal,
                virtual
            });
        }
        this.helperSampleAt = snapshot.t;
        return items;
    }
    getCpuFromHelper() {
        const snapshot = this.getHelperSnapshot();
        if (!snapshot || !snapshot.cpu) {
            if (!this.helperCpuMissing) {
                this.helperCpuMissing = true;
                writePerfLog("helperCpuMissing");
            }
            return null;
        }
        if (this.helperCpuMissing) {
            this.helperCpuMissing = false;
            writePerfLog("helperCpuAvailable");
        }
        return snapshot.cpu;
    }
    getMemFromHelper() {
        const snapshot = this.getHelperSnapshot();
        if (!snapshot || !snapshot.mem) {
            if (!this.helperMemMissing) {
                this.helperMemMissing = true;
                writePerfLog("helperMemMissing");
            }
            return null;
        }
        if (this.helperMemMissing) {
            this.helperMemMissing = false;
            writePerfLog("helperMemAvailable");
        }
        return snapshot.mem;
    }
    getGpuFromHelper() {
        const snapshot = this.getHelperSnapshot();
        if (!snapshot || !snapshot.gpus || snapshot.gpus.length === 0) {
            if (!this.helperGpuMissing) {
                this.helperGpuMissing = true;
                writePerfLog("helperGpuMissing");
            }
            return null;
        }
        if (this.helperGpuMissing) {
            this.helperGpuMissing = false;
            writePerfLog("helperGpuAvailable");
        }
        return snapshot.gpus;
    }
    getTopProcessFromHelper() {
        const snapshot = this.getHelperSnapshot();
        if (!snapshot || !snapshot.topProcess)
            return null;
        return snapshot.topProcess;
    }
    getDiskPerfFromHelper() {
        const snapshot = this.getHelperSnapshot();
        if (!snapshot || !snapshot.diskPerf) {
            if (!this.helperDiskPerfMissing) {
                this.helperDiskPerfMissing = true;
                writePerfLog("helperDiskPerfMissing");
            }
            return null;
        }
        if (this.helperDiskPerfMissing) {
            this.helperDiskPerfMissing = false;
            writePerfLog("helperDiskPerfAvailable");
        }
        const total = snapshot.diskPerf.total;
        const totalPerf = {
            activePct: toPercent(total?.activePct ?? null),
            readBps: toNumber(total?.readBps ?? null),
            writeBps: toNumber(total?.writeBps ?? null)
        };
        const byId = {};
        for (const item of snapshot.diskPerf.items) {
            const key = normalizeDiskId$1(item.id);
            if (!key)
                continue;
            byId[key] = {
                activePct: toPercent(item.activePct ?? null),
                readBps: toNumber(item.readBps ?? null),
                writeBps: toNumber(item.writeBps ?? null)
            };
        }
        return { total: totalPerf, byId };
    }
    loadNetHistory() {
        const loaded = readNetHistory();
        if (!loaded)
            return;
        const { payload, legacy } = loaded;
        const now = Date.now();
        const cutoff = now - MAX_NET_HISTORY_MINUTES_MS;
        for (const [key, entries] of Object.entries(payload.historyMinutes)) {
            if (!Array.isArray(entries))
                continue;
            const list = [];
            for (const entry of entries) {
                if (!Array.isArray(entry) || entry.length < 3)
                    continue;
                const t = Number(entry[0]);
                const rx = Number(entry[1]);
                const tx = Number(entry[2]);
                if (!Number.isFinite(t) || !Number.isFinite(rx) || !Number.isFinite(tx))
                    continue;
                if (t < cutoff)
                    continue;
                list.push({ t, rx, tx });
            }
            if (list.length > 0) {
                list.sort((a, b) => a.t - b.t);
                const minuteList = [];
                let lastBucket = -1;
                for (const entry of list) {
                    const bucket = Math.floor(entry.t / NET_HISTORY_MINUTE_MS);
                    if (bucket === lastBucket && minuteList.length > 0) {
                        minuteList[minuteList.length - 1] = entry;
                        continue;
                    }
                    minuteList.push(entry);
                    lastBucket = bucket;
                }
                if (minuteList.length > 0) {
                    this.netHistoryMinutes.set(key, minuteList);
                }
            }
        }
        if (legacy) {
            this.netHistoryDirty = true;
        }
        this.netHistoryPersistAt = now;
    }
    async persistNetHistory(force = false) {
        const now = Date.now();
        // If not forced, check debounce conditions
        if (!force) {
            if (!this.netHistoryDirty)
                return;
            // Debounce: only write if enough time has elapsed
            const timeSinceLastWrite = now - this.netHistoryPersistAt;
            if (timeSinceLastWrite < NET_HISTORY_PERSIST_MS) {
                // Schedule a future write if not already pending
                if (!this.netHistoryWritePending) {
                    this.netHistoryWritePending = true;
                    const delay = NET_HISTORY_PERSIST_MS - timeSinceLastWrite;
                    // Clear any existing timer
                    if (this.netHistoryWriteTimer) {
                        clearTimeout(this.netHistoryWriteTimer);
                    }
                    this.netHistoryWriteTimer = setTimeout(() => {
                        this.netHistoryWritePending = false;
                        this.netHistoryWriteTimer = undefined;
                        void this.persistNetHistory();
                    }, delay);
                }
                return;
            }
        }
        if (this.netHistoryMinutes.size === 0)
            return;
        const historyMinutes = {};
        for (const [key, entries] of this.netHistoryMinutes.entries()) {
            historyMinutes[key] = entries.map((entry) => [entry.t, entry.rx, entry.tx]);
        }
        try {
            const success = await writeNetHistory({ version: 1, savedAt: now, historyMinutes });
            if (success) {
                this.netHistoryPersistAt = now;
                this.netHistoryDirty = false;
            }
        }
        catch (err) {
            writePerfLog("Failed to persist network history", { error: String(err) });
        }
    }
    updateNetHistory(key, rxBytes, txBytes, now) {
        if (rxBytes === null || txBytes === null)
            return;
        const entry = { t: now, rx: rxBytes, tx: txBytes };
        const secondsList = this.netHistorySeconds.get(key) ?? [];
        secondsList.push(entry);
        const secondCutoff = now - MAX_NET_HISTORY_SECONDS_MS;
        while (secondsList.length > 1 && secondsList[0].t < secondCutoff) {
            secondsList.shift();
        }
        this.netHistorySeconds.set(key, secondsList);
        const minuteList = this.netHistoryMinutes.get(key) ?? [];
        const minuteBucket = Math.floor(now / NET_HISTORY_MINUTE_MS);
        const lastEntry = minuteList.length > 0 ? minuteList[minuteList.length - 1] : null;
        const lastBucket = lastEntry ? Math.floor(lastEntry.t / NET_HISTORY_MINUTE_MS) : -1;
        if (minuteBucket === lastBucket && lastEntry) {
            lastEntry.t = entry.t;
            lastEntry.rx = entry.rx;
            lastEntry.tx = entry.tx;
        }
        else {
            minuteList.push({ ...entry });
            this.netHistoryDirty = true;
        }
        const minuteCutoff = now - MAX_NET_HISTORY_MINUTES_MS;
        while (minuteList.length > 1 && minuteList[0].t < minuteCutoff) {
            minuteList.shift();
        }
        this.netHistoryMinutes.set(key, minuteList);
    }
    shouldPoll(now, lastAt, intervalMs, hasCache, force, ensure) {
        if (force)
            return true;
        if (!hasCache && ensure)
            return true;
        if (!hasCache)
            return true;
        return now - lastAt >= intervalMs;
    }
    queueCpuMemoryPoll(now, needCpu, needMemory, force, ensure) {
        if (!needCpu && !needMemory)
            return null;
        if (this.cpuMemInFlight)
            return this.cpuMemInFlight;
        const hasCache = this.cpuMemAt > 0;
        if (!this.shouldPoll(now, this.cpuMemAt, CPU_MEM_INTERVAL_MS, hasCache, force, ensure)) {
            return null;
        }
        this.cpuMemInFlight = this.pollCpuMemory(needCpu, needMemory)
            .catch(() => undefined)
            .finally(() => {
            this.cpuMemInFlight = null;
        });
        return this.cpuMemInFlight;
    }
    async pollCpuMemory(needCpu, needMemory) {
        const pollStart = node_perf_hooks.performance.now();
        try {
            const helperCpu = needCpu ? this.getCpuFromHelper() : null;
            const helperMem = needMemory ? this.getMemFromHelper() : null;
            let cpuTotal = this.snapshot.cpu.total;
            let cpuCores = this.snapshot.cpu.cores;
            if (needCpu) {
                if (helperCpu) {
                    cpuTotal = toPercent(helperCpu.total);
                    cpuCores = helperCpu.cores ? helperCpu.cores.map((value) => toPercent(value) ?? 0) : null;
                }
                else {
                    cpuTotal = null;
                    cpuCores = null;
                }
            }
            let memUsedBytes = this.snapshot.memUsedBytes;
            let memTotalBytes = this.snapshot.memTotalBytes;
            let memUsedPct = this.snapshot.memUsedPct;
            if (needMemory) {
                if (helperMem && helperMem.totalBytes > 0) {
                    memUsedBytes = helperMem.usedBytes;
                    memTotalBytes = helperMem.totalBytes;
                    memUsedPct = toPercent((helperMem.usedBytes / helperMem.totalBytes) * 100);
                }
                else {
                    memUsedBytes = null;
                    memTotalBytes = null;
                    memUsedPct = null;
                }
            }
            const helperTopProcess = this.getTopProcessFromHelper();
            const topProcess = helperTopProcess
                ? {
                    cpuName: helperTopProcess.cpuName,
                    cpuPct: toNumber(helperTopProcess.cpuPct),
                    memName: helperTopProcess.memName,
                    memMB: toNumber(helperTopProcess.memMB),
                    cpuIconBase64: helperTopProcess.cpuIconBase64,
                    memIconBase64: helperTopProcess.memIconBase64
                }
                : this.snapshot.topProcess;
            this.cpuMemAt = Date.now();
            this.snapshot = {
                ...this.snapshot,
                cpu: {
                    total: cpuTotal,
                    cores: cpuCores
                },
                memUsedPct,
                memUsedBytes,
                memTotalBytes,
                topProcess
            };
            this.emit(this.snapshot);
        }
        catch {
            // Ignore polling errors to keep tick loop alive.
        }
        finally {
            this.recordPerf("cpuMem", node_perf_hooks.performance.now() - pollStart);
        }
    }
    queueGpuPoll(now, needGpu, force, ensure) {
        if (!needGpu)
            return null;
        if (this.gpuPollInFlight)
            return this.gpuPollInFlight;
        const hasCache = this.gpuPollAt > 0;
        if (!this.shouldPoll(now, this.gpuPollAt, GPU_CACHE_MS, hasCache, force, ensure)) {
            return null;
        }
        this.gpuPollInFlight = this.pollGpu(force)
            .catch(() => undefined)
            .finally(() => {
            this.gpuPollInFlight = null;
        });
        return this.gpuPollInFlight;
    }
    async pollGpu(force) {
        const pollStart = node_perf_hooks.performance.now();
        try {
            let gpus = this.snapshot.gpus;
            const helperGpus = this.getGpuFromHelper();
            if (helperGpus && helperGpus.length > 0) {
                gpus = helperGpus.map((gpu) => {
                    const vramTotal = typeof gpu.vramTotalBytes === "number" ? gpu.vramTotalBytes / (1024 * 1024) : null;
                    const vramUsed = typeof gpu.vramUsedBytes === "number" ? gpu.vramUsedBytes / (1024 * 1024) : null;
                    const vramPct = vramTotal && vramTotal > 0 && typeof vramUsed === "number"
                        ? toPercent((vramUsed / vramTotal) * 100)
                        : null;
                    return {
                        index: gpu.index,
                        name: gpu.name || `GPU ${gpu.index + 1}`,
                        loadPct: toPercent(gpu.loadPct),
                        vramPct,
                        tempC: toNumber(gpu.tempC),
                        vramTotal,
                        vramUsed,
                        powerW: toNumber(gpu.powerW),
                        topComputeName: gpu.topComputeName,
                        topComputePct: toNumber(gpu.topComputePct),
                        topComputeIconBase64: gpu.topComputeIconBase64
                    };
                });
            }
            else {
                gpus = [];
            }
            this.gpuPollAt = Date.now();
            this.snapshot = {
                ...this.snapshot,
                gpus
            };
            this.emit(this.snapshot);
        }
        catch {
            // Ignore polling errors.
        }
        finally {
            this.recordPerf("gpu", node_perf_hooks.performance.now() - pollStart);
        }
    }
    queueDiskPerfPoll(now, needDisk, force, ensure) {
        if (!needDisk)
            return null;
        if (this.diskPerfInFlight)
            return this.diskPerfInFlight;
        const hasCache = this.diskPerfAt > 0;
        if (!this.shouldPoll(now, this.diskPerfAt, DISK_PERF_INTERVAL_MS, hasCache, force, ensure)) {
            return null;
        }
        this.diskPerfInFlight = this.pollDiskPerf(needDisk, force)
            .catch(() => undefined)
            .finally(() => {
            this.diskPerfInFlight = null;
        });
        return this.diskPerfInFlight;
    }
    async pollDiskPerf(needDisk, force) {
        if (!needDisk)
            return;
        const pollStart = node_perf_hooks.performance.now();
        try {
            let diskThroughput = this.snapshot.diskThroughput;
            let diskActivityPct = this.snapshot.diskActivityPct;
            let diskPerfById = this.snapshot.diskPerfById;
            const winDisk = this.getDiskPerfFromHelper();
            if (winDisk) {
                diskThroughput = {
                    readBps: toNumber(winDisk.total.readBps),
                    writeBps: toNumber(winDisk.total.writeBps)
                };
                diskActivityPct = toPercent(winDisk.total.activePct ?? null);
                diskPerfById = winDisk.byId;
            }
            else if (!this.diskPerfAt || force) {
                diskThroughput = { readBps: null, writeBps: null };
                diskActivityPct = null;
                diskPerfById = {};
            }
            this.diskPerfAt = Date.now();
            this.snapshot = {
                ...this.snapshot,
                diskThroughput,
                diskActivityPct,
                diskPerfById
            };
            this.emit(this.snapshot);
        }
        catch {
            // Ignore polling errors.
        }
        finally {
            this.recordPerf("diskPerf", node_perf_hooks.performance.now() - pollStart);
        }
    }
    queueDiskSizePoll(now, needDisk, force, ensure) {
        if (!needDisk)
            return null;
        if (this.diskSizeInFlight)
            return this.diskSizeInFlight;
        const hasCache = !!this.fsSizeCache && this.fsSizeAt > 0;
        if (!this.shouldPoll(now, this.fsSizeAt, FS_SIZE_CACHE_MS, hasCache, force, ensure)) {
            return null;
        }
        this.diskSizeInFlight = this.pollDiskSize(force)
            .catch(() => undefined)
            .finally(() => {
            this.diskSizeInFlight = null;
        });
        return this.diskSizeInFlight;
    }
    async pollDiskSize(force) {
        const pollStart = node_perf_hooks.performance.now();
        try {
            const fsSize = await this.getFsSizeCached(force);
            if (!fsSize)
                return;
            const disks = fsSize.map((disk) => {
                const mount = disk.mount || disk.fs || "";
                const fs = disk.fs || mount;
                const id = mount || fs;
                return {
                    id,
                    mount,
                    fs,
                    size: disk.size,
                    usePct: toPercent(disk.use)
                };
            });
            this.snapshot = {
                ...this.snapshot,
                disks
            };
            this.emit(this.snapshot);
        }
        catch {
            // Ignore polling errors.
        }
        finally {
            this.recordPerf("diskSize", node_perf_hooks.performance.now() - pollStart);
        }
    }
    queueNetStatsPoll(now, needNetwork, force, ensure) {
        if (!needNetwork)
            return null;
        if (this.netStatsInFlight)
            return this.netStatsInFlight;
        const hasCache = !!this.netStatsCache && this.netStatsAt > 0;
        if (!this.shouldPoll(now, this.netStatsAt, NET_STATS_CACHE_MS, hasCache, force, ensure)) {
            return null;
        }
        this.netStatsInFlight = this.pollNetStats(force)
            .catch(() => undefined)
            .finally(() => {
            this.netStatsInFlight = null;
        });
        return this.netStatsInFlight;
    }
    async pollNetStats(force) {
        const pollStart = node_perf_hooks.performance.now();
        try {
            const netStats = await this.getNetStatsCached(force);
            if (!netStats) {
                if (!this.netStatsAt && force) {
                    this.snapshot = {
                        ...this.snapshot,
                        net: {
                            interfaces: [],
                            total: {
                                iface: "total",
                                rxBps: null,
                                txBps: null,
                                rxBytes: null,
                                txBytes: null
                            }
                        }
                    };
                    this.emit(this.snapshot);
                }
                return;
            }
            const netInterfaces = netStats.map(mapNetStatsSample);
            const netTotal = netInterfaces.length > 0 ? sumNet(netInterfaces) : this.snapshot.net.total;
            const now = Date.now();
            this.updateNetHistory("total", netTotal.rxBytes, netTotal.txBytes, now);
            for (const net of netInterfaces) {
                this.updateNetHistory(net.iface, net.rxBytes, net.txBytes, now);
            }
            void this.persistNetHistory();
            this.snapshot = {
                ...this.snapshot,
                net: {
                    interfaces: netInterfaces,
                    total: netTotal
                }
            };
            this.emit(this.snapshot);
        }
        catch {
            // Ignore polling errors.
        }
        finally {
            this.recordPerf("netStats", node_perf_hooks.performance.now() - pollStart);
        }
    }
    queueNetIfacesPoll(now, needNetwork, force, ensure) {
        if (!needNetwork)
            return null;
        if (this.netIfacesInFlight)
            return this.netIfacesInFlight;
        const hasCache = !!this.netIfacesCache && this.netIfacesAt > 0;
        if (!this.shouldPoll(now, this.netIfacesAt, NET_IFACE_CACHE_MS, hasCache, force, ensure)) {
            return null;
        }
        this.netIfacesInFlight = this.pollNetIfaces(force)
            .catch(() => undefined)
            .finally(() => {
            this.netIfacesInFlight = null;
        });
        return this.netIfacesInFlight;
    }
    async pollNetIfaces(force) {
        const pollStart = node_perf_hooks.performance.now();
        try {
            const netIfaces = await this.getNetIfacesCached(force);
            if (!netIfaces)
                return;
            this.snapshot = {
                ...this.snapshot,
                netIfaces
            };
            this.emit(this.snapshot);
        }
        catch {
            // Ignore polling errors.
        }
        finally {
            this.recordPerf("netIfaces", node_perf_hooks.performance.now() - pollStart);
        }
    }
    async tick(options) {
        if (!this.snapshot.osSupported) {
            this.emit(this.snapshot);
            return;
        }
        const forceGroups = options?.forceGroups ?? [];
        const ensureGroups = options?.ensureGroups ?? [];
        const needCpu = this.isGroupActive("cpu") || forceGroups.includes("cpu") || ensureGroups.includes("cpu");
        const needMemory = this.isGroupActive("memory") || forceGroups.includes("memory") || ensureGroups.includes("memory");
        const needGpu = this.isGroupActive("gpu") || forceGroups.includes("gpu") || ensureGroups.includes("gpu");
        const needDisk = this.isGroupActive("disk") || forceGroups.includes("disk") || ensureGroups.includes("disk");
        const needNetwork = this.isGroupActive("network") || forceGroups.includes("network") || ensureGroups.includes("network");
        const forceCpuMem = forceGroups.includes("cpu") || forceGroups.includes("memory");
        const ensureCpuMem = ensureGroups.includes("cpu") || ensureGroups.includes("memory");
        const forceGpu = forceGroups.includes("gpu");
        const ensureGpu = ensureGroups.includes("gpu");
        const forceDisk = forceGroups.includes("disk");
        const ensureDisk = ensureGroups.includes("disk");
        const forceNetwork = forceGroups.includes("network");
        const ensureNetwork = ensureGroups.includes("network");
        const tickStart = node_perf_hooks.performance.now();
        try {
            const now = Date.now();
            const awaitables = [];
            const cpuMemPromise = this.queueCpuMemoryPoll(now, needCpu, needMemory, forceCpuMem, ensureCpuMem);
            if (cpuMemPromise && (forceCpuMem || ensureCpuMem))
                awaitables.push(cpuMemPromise);
            const gpuPromise = this.queueGpuPoll(now, needGpu, forceGpu, ensureGpu);
            if (gpuPromise && (forceGpu || ensureGpu))
                awaitables.push(gpuPromise);
            const diskPerfPromise = this.queueDiskPerfPoll(now, needDisk, forceDisk, ensureDisk);
            if (diskPerfPromise && (forceDisk || ensureDisk))
                awaitables.push(diskPerfPromise);
            const diskSizePromise = this.queueDiskSizePoll(now, needDisk, forceDisk, ensureDisk);
            if (diskSizePromise && (forceDisk || ensureDisk))
                awaitables.push(diskSizePromise);
            const netStatsPromise = this.queueNetStatsPoll(now, needNetwork, forceNetwork, ensureNetwork);
            if (netStatsPromise && (forceNetwork || ensureNetwork))
                awaitables.push(netStatsPromise);
            const netIfacesPromise = this.queueNetIfacesPoll(now, needNetwork, forceNetwork, ensureNetwork);
            if (netIfacesPromise && (forceNetwork || ensureNetwork))
                awaitables.push(netIfacesPromise);
            const shouldAwait = forceGroups.length > 0 || ensureGroups.length > 0;
            if (!shouldAwait) {
                this.emit(this.snapshot);
            }
            else if (awaitables.length > 0) {
                await Promise.allSettled(awaitables);
                this.emit(this.snapshot);
            }
            else {
                this.emit(this.snapshot);
            }
        }
        catch {
            this.emit(this.snapshot);
        }
        finally {
            const tickMs = node_perf_hooks.performance.now() - tickStart;
            this.recordPerf("tick", tickMs);
            this.maybeLogPerf(tickMs);
        }
    }
    recordPerf(label, elapsedMs) {
        if (!Number.isFinite(elapsedMs))
            return;
        const entry = this.perfStats.get(label) ?? { count: 0, totalMs: 0, maxMs: 0, lastMs: 0 };
        entry.count += 1;
        entry.totalMs += elapsedMs;
        entry.lastMs = elapsedMs;
        if (elapsedMs > entry.maxMs) {
            entry.maxMs = elapsedMs;
        }
        this.perfStats.set(label, entry);
    }
    maybeLogPerf(tickMs) {
        const now = Date.now();
        const due = now - this.perfLastLogAt >= PERF_LOG_INTERVAL_MS;
        const slow = tickMs >= PERF_SLOW_TICK_MS;
        if (!due && !slow)
            return;
        const summary = {};
        for (const [label, entry] of this.perfStats) {
            const avg = entry.count > 0 ? entry.totalMs / entry.count : 0;
            summary[label] = {
                avgMs: Math.round(avg * 10) / 10,
                maxMs: Math.round(entry.maxMs * 10) / 10,
                lastMs: Math.round(entry.lastMs * 10) / 10,
                count: entry.count
            };
        }
        const processStats = this.sampleProcessUsage(now);
        writePerfLog("perfSummary", {
            reason: slow ? "slowTick" : "interval",
            tickMs: Math.round(tickMs * 10) / 10,
            subscribers: this.subscribers.size,
            summary,
            process: processStats
        });
        this.perfLastLogAt = now;
    }
    sampleProcessUsage(now) {
        const memory = process.memoryUsage();
        const toMb = (bytes) => Math.round((bytes / (1024 * 1024)) * 10) / 10;
        let cpuPct = null;
        let cpuMs = null;
        if (this.perfProcessLastAt > 0 && this.perfProcessLastCpu) {
            const elapsedMs = now - this.perfProcessLastAt;
            if (elapsedMs > 0) {
                const delta = process.cpuUsage(this.perfProcessLastCpu);
                cpuMs = (delta.user + delta.system) / 1000;
                cpuPct = Math.round((cpuMs / elapsedMs) * 1000) / 10;
            }
        }
        this.perfProcessLastAt = now;
        this.perfProcessLastCpu = process.cpuUsage();
        return {
            cpuPct,
            cpuMs,
            rssMb: toMb(memory.rss),
            heapMb: toMb(memory.heapUsed),
            extMb: toMb(memory.external)
        };
    }
}
const statsPoller = new StatsPoller();

const log = streamDeck.logger.createScope("MetricAction");
const DEBUG_LOG_ROTATE_BYTES = 100 * 1024 * 1024;
const DEBUG_LOG_ROTATE_CHECK_MS = 10 * 1000;
let debugLogRotateAt = 0;
const debugLogPaths = (() => {
    const paths = [];
    // Try plugin installation directory first (production)
    const pluginDir = path.resolve(__dirname, "..");
    paths.push(path.join(pluginDir, "debug.log"));
    const appData = process.env.APPDATA || process.env.LOCALAPPDATA;
    if (appData) {
        paths.push(path.join(appData, "Elgato", "StreamDeck", "Plugins", "com.crest.simplestats.sdPlugin", "debug.log"));
    }
    if (process.env.USERPROFILE) {
        paths.push(path.join(process.env.USERPROFILE, "SimpleStats-debug.log"));
    }
    paths.push(path.join(process.cwd(), "debug.log"));
    return paths;
})();
let activeDebugLogPath = null;
function rotateDebugLogIfNeeded(candidate) {
    const now = Date.now();
    if (now - debugLogRotateAt < DEBUG_LOG_ROTATE_CHECK_MS)
        return;
    debugLogRotateAt = now;
    try {
        if (!fs.existsSync(candidate))
            return;
        const stats = fs.statSync(candidate);
        if (stats.size < DEBUG_LOG_ROTATE_BYTES)
            return;
        fs.truncateSync(candidate, 0);
    }
    catch {
        // Ignore rotation errors.
    }
}
function writeDebugLog(message, data) {
    try {
        const stamp = new Date().toISOString();
        const payload = data ? ` ${JSON.stringify(data)}` : "";
        const line = `${stamp} ${message}${payload}\n`;
        const candidates = activeDebugLogPath ? [activeDebugLogPath] : debugLogPaths;
        for (const candidate of candidates) {
            try {
                const dir = path.dirname(candidate);
                fs.mkdirSync(dir, { recursive: true });
                rotateDebugLogIfNeeded(candidate);
                fs.appendFileSync(candidate, line);
                activeDebugLogPath = candidate;
                return;
            }
            catch {
                // Try the next path.
            }
        }
    }
    catch {
        // Swallow logging errors to avoid impacting the plugin.
    }
}
writeDebugLog("loggerInit", { paths: debugLogPaths });
const HISTORY_WINDOW_SEC = 60;
const HISTORY_CACHE_TTL_MS = 10 * 60 * 1000;
const HISTORY_CACHE_MAX = 200;
const historyCache = new Map();
const BACKGROUND_TTL_MS = HISTORY_WINDOW_SEC * 1000;
const backgroundStates = new Map();
let backgroundUnsubscribe = null;
const METRICS_BY_GROUP = {
    cpu: ["cpu-total", "cpu-core", "cpu-peak", "top-cpu"],
    gpu: ["gpu-load", "gpu-vram", "gpu-vram-used", "gpu-temp", "gpu-power", "gpu-top-compute"],
    memory: ["mem-total", "mem-used", "top-mem", "top-mem-pct"],
    disk: ["disk-activity", "disk-used", "disk-free", "disk-read", "disk-write"],
    network: ["net-up", "net-down", "net-total"],
    system: ["clock"]
};
const DEFAULT_METRIC = {
    cpu: "cpu-total",
    gpu: "gpu-load",
    memory: "mem-total",
    disk: "disk-activity",
    network: "net-up",
    system: "clock"
};
const DEFAULT_SETTINGS = {
    group: "cpu",
    cpuCore: 1,
    gpuIndex: 0,
    diskId: "",
    netIface: "",
    netPeriodSec: 60,
    pollIntervalSec: 1,
    warnThreshold: 0,
    topThreshold: 5
};
const LEGACY_DEFAULTS = {
    "com.crest.simplestats.stat": { group: "cpu", metric: "cpu-total" },
    "com.crest.simplestats.cpu": { group: "cpu", metric: "cpu-total" },
    "com.crest.simplestats.gpu": { group: "gpu", metric: "gpu-load" },
    "com.crest.simplestats.gputemp": { group: "gpu", metric: "gpu-temp" },
    "com.crest.simplestats.memory": { group: "memory", metric: "mem-total" },
    "com.crest.simplestats.disk": { group: "disk", metric: "disk-use" },
    "com.crest.simplestats.network": { group: "network", metric: "net-up" }
};
function getLegacyDefaults(manifestId) {
    return manifestId ? LEGACY_DEFAULTS[manifestId] : undefined;
}
function hasAnyMetricSettings(settings) {
    return Boolean(settings &&
        (settings.group !== undefined ||
            settings.metric !== undefined ||
            settings.cpuPerCore !== undefined ||
            settings.cpuCore !== undefined ||
            settings.gpuIndex !== undefined ||
            settings.diskId !== undefined ||
            settings.netIface !== undefined ||
            settings.netPeriodSec !== undefined ||
            settings.pollIntervalSec !== undefined ||
            settings.warnThreshold !== undefined ||
            settings.topThreshold !== undefined ||
            settings.critThreshold !== undefined));
}
const KEY_SIZE = 72;
const LABEL_Y = 9;
const VALUE_Y = 25;
const GRAPH_LEFT = 5;
const GRAPH_RIGHT = KEY_SIZE - 5;
const GRAPH_TOP = 30;
const GRAPH_BOTTOM = KEY_SIZE - 5;
const TEXT_LEFT = 5;
const TEXT_WIDTH = KEY_SIZE - TEXT_LEFT * 2;
const GROUP_STYLE = {
    cpu: {
        line: "#27D4FF",
        fill: "#27D4FF",
        label: "#8FE7FF",
        value: "#FFFFFF",
        background: "#0B0D10"
    },
    gpu: {
        line: "#A06CFF",
        fill: "#A06CFF",
        label: "#C6A7FF",
        value: "#FFFFFF",
        background: "#0B0D10"
    },
    memory: {
        line: "#2A6DFF",
        fill: "#2A6DFF",
        label: "#8FB4FF",
        value: "#FFFFFF",
        background: "#0B0D10"
    },
    disk: {
        line: "#4CFF8A",
        fill: "#4CFF8A",
        label: "#A6FFC7",
        value: "#FFFFFF",
        background: "#0B0D10"
    },
    network: {
        line: "#FF6FB1",
        fill: "#FF6FB1",
        label: "#FFC1DD",
        value: "#FFFFFF",
        background: "#0B0D10"
    },
    system: {
        line: "#FFD166",
        fill: "#FFD166",
        label: "#FFE2A3",
        value: "#FFFFFF",
        background: "#0B0D10"
    }
};
class HistorySeries {
    values = [];
    maxPoints;
    constructor(maxPoints) {
        this.maxPoints = Math.max(1, Math.round(maxPoints));
    }
    push(value) {
        const safe = typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : null;
        this.values.push(safe);
        if (this.values.length > this.maxPoints) {
            this.values.shift();
        }
    }
    setMaxPoints(maxPoints) {
        const next = Math.max(1, Math.round(maxPoints));
        if (next === this.maxPoints)
            return false;
        this.maxPoints = next;
        if (this.values.length > this.maxPoints) {
            this.values = this.values.slice(-this.maxPoints);
        }
        return true;
    }
    clear() {
        this.values = [];
    }
    getValues() {
        return [...this.values];
    }
    setValues(values) {
        this.values = values
            .map((value) => (typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : null))
            .slice(-this.maxPoints);
    }
}
function historyPointsForInterval(intervalSec) {
    if (!Number.isFinite(intervalSec) || intervalSec <= 0)
        return 1;
    return Math.max(1, Math.round(HISTORY_WINDOW_SEC / intervalSec));
}
function intervalMsForSettings(settings) {
    return settings.group === "disk" && (settings.metric === "disk-used" || settings.metric === "disk-free")
        ? 60_000
        : Math.max(1, settings.pollIntervalSec) * 1000;
}
function historyCacheBaseKey(action) {
    const coords = action.coordinates ? `${action.coordinates.row},${action.coordinates.column}` : "na";
    const manifest = action.manifestId ?? "unknown";
    return `${manifest}|${coords}`;
}
function historyCacheKey(baseKey, settingsKeyValue) {
    return `${baseKey}|${settingsKeyValue}`;
}
function pruneHistoryCache(now = Date.now()) {
    for (const [key, entry] of historyCache.entries()) {
        if (now - entry.lastSeen > HISTORY_CACHE_TTL_MS) {
            historyCache.delete(key);
        }
    }
    if (historyCache.size <= HISTORY_CACHE_MAX)
        return;
    const entries = [...historyCache.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen);
    while (entries.length > HISTORY_CACHE_MAX) {
        const entry = entries.shift();
        if (entry)
            historyCache.delete(entry[0]);
    }
}
function saveHistoryToCache(state, actionId, force = false) {
    const now = Date.now();
    if (!force && typeof state.lastCacheAt === "number" && now - state.lastCacheAt < 5000) {
        return;
    }
    historyCache.set(state.cacheKey, {
        values: state.history.getValues(),
        settingsKey: state.settingsKey,
        lastSeen: now
    });
    state.lastCacheAt = now;
    pruneHistoryCache(now);
    if (force) {
        writeDebugLog("historyCacheStore", { actionId, cacheKey: state.cacheKey });
    }
}
function stopBackgroundState(cacheKey, state) {
    backgroundStates.delete(cacheKey);
    statsPoller.clearInterest(state.bgId);
    if (backgroundStates.size === 0 && backgroundUnsubscribe) {
        backgroundUnsubscribe();
        backgroundUnsubscribe = null;
    }
}
function updateBackgroundState(state, snapshot, now) {
    if (!snapshot.osSupported)
        return;
    const intervalMs = intervalMsForSettings(state.settings);
    if (state.lastRenderAt && now - state.lastRenderAt < intervalMs)
        return;
    state.lastRenderAt = now;
    state.history.setMaxPoints(historyPointsForInterval(intervalMs / 1000));
    const display = buildMetricDisplay(snapshot, state.settings);
    state.history.push(display.graphValue);
    historyCache.set(state.cacheKey, {
        values: state.history.getValues(),
        settingsKey: state.settingsKey,
        lastSeen: now
    });
    pruneHistoryCache(now);
}
function ensureBackgroundSubscription() {
    if (backgroundUnsubscribe)
        return;
    backgroundUnsubscribe = statsPoller.subscribe((snapshot) => {
        const now = Date.now();
        for (const [key, state] of backgroundStates.entries()) {
            if (now > state.expiresAt) {
                stopBackgroundState(key, state);
                continue;
            }
            updateBackgroundState(state, snapshot, now);
        }
    });
}
function escapeSvg(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}
function computeGraphPaths(values, fixedMax, minMax, fixedMin) {
    const plotValues = values.length === 1 ? [values[0], values[0]] : values;
    const numeric = plotValues.map((value) => (typeof value === "number" && Number.isFinite(value) ? value : 0));
    const smoothed = numeric.length > 4
        ? numeric.map((value, index) => {
            if (index < 2 || index > numeric.length - 3)
                return value;
            return (numeric[index - 2] + numeric[index - 1] + 2 * value + numeric[index + 1] + numeric[index + 2]) / 6;
        })
        : numeric;
    const computedMax = Math.max(...smoothed, 0);
    const computedMin = Math.min(...smoothed, 0);
    let max = typeof fixedMax === "number" && Number.isFinite(fixedMax) && fixedMax > 0 ? fixedMax : computedMax;
    if (typeof minMax === "number" && Number.isFinite(minMax) && minMax > 0) {
        max = Math.max(max, minMax);
    }
    let min = typeof fixedMin === "number" && Number.isFinite(fixedMin) ? fixedMin : computedMin;
    if (!Number.isFinite(min))
        min = 0;
    if (!Number.isFinite(max) || max <= min) {
        max = min + 1;
    }
    const graphWidth = GRAPH_RIGHT - GRAPH_LEFT;
    const graphHeight = GRAPH_BOTTOM - GRAPH_TOP;
    const step = plotValues.length > 1 ? graphWidth / (plotValues.length - 1) : 0;
    if (!Number.isFinite(max) || max <= min) {
        const baseline = `M${GRAPH_LEFT} ${GRAPH_BOTTOM} L${GRAPH_RIGHT} ${GRAPH_BOTTOM}`;
        return { line: baseline, area: "", hasData: false };
    }
    const points = smoothed.map((value, index) => {
        const clamped = Math.min(Math.max(value, min), max);
        const x = GRAPH_LEFT + step * index;
        const y = GRAPH_BOTTOM - ((clamped - min) / (max - min)) * graphHeight;
        return { x, y };
    });
    const fmt = (num) => num.toFixed(2);
    let line = "";
    if (points.length > 0) {
        line = `M${fmt(points[0].x)} ${fmt(points[0].y)}`;
        if (points.length === 2) {
            line += ` L${fmt(points[1].x)} ${fmt(points[1].y)}`;
        }
        else if (points.length > 2) {
            for (let i = 1; i < points.length; i += 1) {
                const prev = points[i - 1];
                const curr = points[i];
                const midX = (prev.x + curr.x) / 2;
                const midY = (prev.y + curr.y) / 2;
                line += ` Q${fmt(prev.x)} ${fmt(prev.y)} ${fmt(midX)} ${fmt(midY)}`;
            }
            const last = points[points.length - 1];
            line += ` T${fmt(last.x)} ${fmt(last.y)}`;
        }
    }
    const last = points[points.length - 1];
    const first = points[0];
    const area = line
        ? `${line} L${fmt(last.x)} ${GRAPH_BOTTOM} L${fmt(first.x)} ${GRAPH_BOTTOM} Z`
        : "";
    return { line, area, hasData: true };
}
function valueFontSize(text) {
    if (text.length <= 4)
        return 15;
    if (text.length <= 6)
        return 13;
    if (text.length <= 8)
        return 12;
    return 11;
}
function textLengthAttrs(text) {
    if (text.length <= 6)
        return "";
    return ` textLength="${TEXT_WIDTH}" lengthAdjust="spacingAndGlyphs"`;
}
const PERCENT_METRICS = new Set([
    "cpu-total", "cpu-core", "cpu-peak", "gpu-load", "gpu-vram",
    "mem-total", "disk-activity", "disk-used", "disk-free", "top-mem-pct"
]);
const WARN_COLOR = "#FF3333";
function getThresholdOverride(value, metric, settings) {
    if (value === null || !Number.isFinite(value))
        return null;
    if (!PERCENT_METRICS.has(metric))
        return null;
    if (settings.warnThreshold > 0 && value >= settings.warnThreshold)
        return WARN_COLOR;
    return null;
}
function buildKeySvg(display, history, group, settings) {
    const baseStyle = GROUP_STYLE[group] ?? GROUP_STYLE.system;
    const warnColor = settings ? getThresholdOverride(display.graphValue, settings.metric, settings) : null;
    const labelColor = baseStyle.label;
    const valueColor = warnColor ?? baseStyle.value;
    const label = escapeSvg(display.label);
    const value = escapeSvg(display.value);
    const valueSize = valueFontSize(display.value);
    // Idle state: faded label + value, no graph or icon
    if (display.idle) {
        return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${KEY_SIZE}" height="${KEY_SIZE}" viewBox="0 0 ${KEY_SIZE} ${KEY_SIZE}">
      <rect width="${KEY_SIZE}" height="${KEY_SIZE}" rx="10" fill="${baseStyle.background}" />
      <text x="${TEXT_LEFT}" y="${LABEL_Y}" text-anchor="start" font-family="Segoe UI, Arial, sans-serif"
        font-size="9" font-weight="700" fill="${labelColor}"${textLengthAttrs(display.label)}>${label}</text>
      <text x="${TEXT_LEFT}" y="${VALUE_Y}" text-anchor="start" font-family="Segoe UI, Arial, sans-serif"
        font-size="${valueSize}" font-weight="700" fill="${baseStyle.value}" opacity="0.25"${textLengthAttrs(display.value)}>${value}</text>
    </svg>
    `.trim();
    }
    // Top-process layout: icon + separate value/name, no graph
    if (display.processName != null) {
        const procName = escapeSvg(display.processName || "");
        const iconMarkup = display.processIcon
            ? `<image x="24" y="32" width="24" height="24" href="data:image/png;base64,${display.processIcon}" />`
            : "";
        return `
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${KEY_SIZE}" height="${KEY_SIZE}" viewBox="0 0 ${KEY_SIZE} ${KEY_SIZE}">
      <rect width="${KEY_SIZE}" height="${KEY_SIZE}" rx="10" fill="${baseStyle.background}" />
      <text x="${TEXT_LEFT}" y="${LABEL_Y}" text-anchor="start" font-family="Segoe UI, Arial, sans-serif"
        font-size="9" font-weight="700" fill="${labelColor}"${textLengthAttrs(display.label)}>${label}</text>
      <text x="${TEXT_LEFT}" y="${VALUE_Y}" text-anchor="start" font-family="Segoe UI, Arial, sans-serif"
        font-size="${valueSize}" font-weight="700" fill="${valueColor}"${textLengthAttrs(display.value)}>${value}</text>
      ${iconMarkup}
      <text x="36" y="64" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif"
        font-size="8" font-weight="600" fill="${labelColor}"${textLengthAttrs(procName)}>${procName}</text>
    </svg>
    `.trim();
    }
    const lineColor = warnColor ?? baseStyle.line;
    const fillColor = baseStyle.fill;
    const values = history.getValues();
    const graph = computeGraphPaths(values, display.graphMax, display.graphMinMax, display.graphMin);
    const graphMarkup = graph.hasData
        ? `<path d="${graph.area}" fill="${fillColor}" fill-opacity="0.18" />
       <path d="${graph.line}" fill="none" stroke="${lineColor}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" opacity="0.95" />`
        : `<path d="${graph.line}" fill="none" stroke="${lineColor}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="3 3" opacity="0.45" />`;
    return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${KEY_SIZE}" height="${KEY_SIZE}" viewBox="0 0 ${KEY_SIZE} ${KEY_SIZE}">
      <rect width="${KEY_SIZE}" height="${KEY_SIZE}" rx="10" fill="${baseStyle.background}" />
      <text x="${TEXT_LEFT}" y="${LABEL_Y}" text-anchor="start" font-family="Segoe UI, Arial, sans-serif"
        font-size="9" font-weight="700" fill="${labelColor}"${textLengthAttrs(display.label)}>${label}</text>
      <text x="${TEXT_LEFT}" y="${VALUE_Y}" text-anchor="start" font-family="Segoe UI, Arial, sans-serif"
        font-size="${valueSize}" font-weight="700" fill="${valueColor}"${textLengthAttrs(display.value)}>${value}</text>
      ${graphMarkup}
    </svg>
  `.trim();
}
function svgToDataUri(svg) {
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
function normalizeSettings(settings) {
    const group = isMetricGroup(settings?.group) ? settings?.group : DEFAULT_SETTINGS.group;
    const requestedMetric = isMetricId(settings?.metric) ? settings.metric : undefined;
    const mappedMetric = group === "disk" && requestedMetric === "disk-use" ? "disk-used" : requestedMetric;
    const cpuPerCore = typeof settings?.cpuPerCore === "boolean" ? settings.cpuPerCore : mappedMetric === "cpu-core";
    const metric = group === "cpu"
        ? mappedMetric === "cpu-peak" || mappedMetric === "top-cpu"
            ? mappedMetric
            : cpuPerCore
                ? "cpu-core"
                : "cpu-total"
        : mappedMetric && METRICS_BY_GROUP[group].includes(mappedMetric)
            ? mappedMetric
            : DEFAULT_METRIC[group];
    return {
        group,
        metric,
        cpuPerCore,
        cpuCore: Math.max(1, toInt(settings?.cpuCore, DEFAULT_SETTINGS.cpuCore)),
        gpuIndex: toInt(settings?.gpuIndex, DEFAULT_SETTINGS.gpuIndex),
        diskId: typeof settings?.diskId === "string" ? settings.diskId : DEFAULT_SETTINGS.diskId,
        netIface: typeof settings?.netIface === "string" ? settings.netIface : DEFAULT_SETTINGS.netIface,
        netPeriodSec: toInt(settings?.netPeriodSec, DEFAULT_SETTINGS.netPeriodSec),
        pollIntervalSec: clampPollInterval(toInt(settings?.pollIntervalSec, DEFAULT_SETTINGS.pollIntervalSec)),
        warnThreshold: Math.max(0, Math.min(100, toInt(settings?.warnThreshold, DEFAULT_SETTINGS.warnThreshold))),
        topThreshold: Math.max(0, Math.min(100, toInt(settings?.topThreshold, DEFAULT_SETTINGS.topThreshold)))
    };
}
function settingsKey(settings) {
    return [
        settings.group,
        settings.metric,
        settings.cpuPerCore ? "1" : "0",
        settings.cpuCore,
        settings.gpuIndex,
        settings.diskId,
        settings.netIface,
        settings.netPeriodSec,
        settings.pollIntervalSec,
        settings.warnThreshold,
        settings.topThreshold
    ].join("|");
}
function toInt(value, fallback) {
    if (typeof value === "number" && Number.isFinite(value))
        return Math.floor(value);
    if (typeof value === "string") {
        const parsed = parseInt(value, 10);
        if (Number.isFinite(parsed))
            return parsed;
    }
    return fallback;
}
function clampPollInterval(value) {
    if (!Number.isFinite(value))
        return DEFAULT_SETTINGS.pollIntervalSec;
    return Math.max(1, Math.min(5, Math.round(value)));
}
function isMetricGroup(value) {
    return (value === "cpu" ||
        value === "gpu" ||
        value === "memory" ||
        value === "disk" ||
        value === "network" ||
        value === "system");
}
function isMetricId(value) {
    return (value === "cpu-total" ||
        value === "cpu-core" ||
        value === "cpu-peak" ||
        value === "gpu-load" ||
        value === "gpu-vram" ||
        value === "gpu-vram-used" ||
        value === "gpu-temp" ||
        value === "gpu-power" ||
        value === "gpu-top-compute" ||
        value === "mem-total" ||
        value === "mem-used" ||
        value === "disk-activity" ||
        value === "disk-used" ||
        value === "disk-free" ||
        value === "disk-use" ||
        value === "disk-read" ||
        value === "disk-write" ||
        value === "net-up" ||
        value === "net-down" ||
        value === "net-total" ||
        value === "top-cpu" ||
        value === "top-mem" ||
        value === "top-mem-pct" ||
        value === "clock");
}
function formatPercent(value) {
    if (value === null || !Number.isFinite(value))
        return "--";
    return `${Math.round(value)}%`;
}
function formatTempC(value) {
    if (value === null || !Number.isFinite(value))
        return "--";
    return `${Math.round(value)}C`;
}
function formatPower(value) {
    if (value === null || !Number.isFinite(value))
        return "--";
    const rounded = value < 10 ? value.toFixed(1) : Math.round(value).toString();
    return `${rounded}W`;
}
function formatRateMbit(value) {
    if (value === null || !Number.isFinite(value))
        return "--";
    const formatted = value < 10 ? value.toFixed(1) : Math.round(value).toString();
    return `${formatted}Mbps`;
}
function formatRateMB(value) {
    if (value === null || !Number.isFinite(value))
        return "--";
    const formatted = value < 10 ? value.toFixed(1) : Math.round(value).toString();
    return `${formatted}MB/s`;
}
function formatClock(value) {
    const pad = (num) => String(num).padStart(2, "0");
    return `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}
function formatBytesShort(value) {
    if (value === null || !Number.isFinite(value))
        return "--";
    const units = ["B", "K", "M", "G", "T"];
    let size = Math.max(0, value);
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }
    const formatted = size < 10 && unitIndex > 0 ? size.toFixed(1) : Math.round(size).toString();
    return `${formatted}${units[unitIndex]}`;
}
function toGibFromBytes(value) {
    if (value === null || !Number.isFinite(value))
        return null;
    return value / (1024 * 1024 * 1024);
}
function toGibFromMaybeMb(value) {
    if (value === null || !Number.isFinite(value))
        return null;
    if (value > 1024 * 1024) {
        return value / (1024 * 1024 * 1024);
    }
    return value / 1024;
}
function formatGigabytes(value) {
    if (value === null || !Number.isFinite(value))
        return "--";
    if (value < 10)
        return `${value.toFixed(1)}GB`;
    return `${Math.round(value)}GB`;
}
function normalizeDiskId(value) {
    const trimmed = (value ?? "").trim();
    if (!trimmed)
        return "";
    const upper = trimmed.toUpperCase();
    if (/^[A-Z]$/.test(upper))
        return `${upper}:`;
    return upper;
}
function labelWithIndex(base, index) {
    if (index > 0)
        return `${base}${index + 1}`;
    return base;
}
function selectGpu(snapshot, index) {
    if (snapshot.gpus.length === 0)
        return null;
    if (index < 0 || index >= snapshot.gpus.length)
        return snapshot.gpus[0];
    return snapshot.gpus[index];
}
function selectDisk(snapshot, diskId) {
    if (snapshot.disks.length === 0)
        return null;
    if (diskId) {
        const match = snapshot.disks.find((disk) => disk.id === diskId || disk.mount === diskId || disk.fs === diskId);
        if (match)
            return match;
    }
    const preferred = snapshot.disks.find((disk) => (disk.mount || "").toLowerCase().startsWith("c:"));
    return preferred || snapshot.disks[0];
}
function selectDiskPerf(snapshot, diskId) {
    const perfMap = snapshot.diskPerfById;
    if (!perfMap || Object.keys(perfMap).length === 0)
        return null;
    const candidates = [];
    if (diskId)
        candidates.push(diskId);
    const disk = selectDisk(snapshot, diskId);
    if (disk) {
        candidates.push(disk.id, disk.mount, disk.fs);
    }
    for (const candidate of candidates) {
        const key = normalizeDiskId(candidate ?? "");
        if (!key)
            continue;
        const match = perfMap[key];
        if (match)
            return match;
    }
    return null;
}
function selectNet(snapshot, iface) {
    if (iface) {
        const match = snapshot.net.interfaces.find((net) => net.iface === iface);
        if (match)
            return match;
    }
    return snapshot.net.total;
}
function diskShortLabel(disk) {
    if (!disk)
        return "DSK";
    const mount = (disk.mount || disk.fs || "").toUpperCase();
    if (mount.length > 0 && mount.length <= 3) {
        return mount;
    }
    return "DSK";
}
function periodLabel(periodSec) {
    if (periodSec >= 86400)
        return "24H";
    if (periodSec >= 3600)
        return "1H";
    return "1M";
}
function bytesToMbit(value) {
    if (value === null || !Number.isFinite(value))
        return null;
    return (value * 8) / 1_000_000;
}
function bytesToMB(value) {
    if (value === null || !Number.isFinite(value))
        return null;
    return value / 1_000_000;
}
function buildMetricDisplay(snapshot, settings) {
    switch (settings.metric) {
        case "cpu-total": {
            return {
                label: "CPU TOTAL",
                value: formatPercent(snapshot.cpu.total),
                graphValue: snapshot.cpu.total,
                graphMax: 100,
                graphMinMax: null,
                graphMin: 0
            };
        }
        case "cpu-core": {
            const cores = snapshot.cpu.cores || [];
            const coreIndex = Math.min(Math.max(settings.cpuCore - 1, 0), Math.max(cores.length - 1, 0));
            const value = cores.length > 0 ? cores[coreIndex] : null;
            return {
                label: `CPU C${coreIndex + 1}`,
                value: formatPercent(value),
                graphValue: value,
                graphMax: 100,
                graphMinMax: null,
                graphMin: 0
            };
        }
        case "cpu-peak": {
            const cores = snapshot.cpu.cores || [];
            const peak = cores.length > 0 ? Math.max(...cores) : null;
            return {
                label: "CPU PEAK",
                value: formatPercent(peak),
                graphValue: peak,
                graphMax: 100,
                graphMinMax: null,
                graphMin: 0
            };
        }
        case "gpu-load": {
            const gpu = selectGpu(snapshot, settings.gpuIndex);
            return {
                label: labelWithIndex("GPU", gpu ? gpu.index : 0),
                value: formatPercent(gpu?.loadPct ?? null),
                graphValue: gpu?.loadPct ?? null,
                graphMax: 100,
                graphMinMax: null,
                graphMin: 0
            };
        }
        case "gpu-vram": {
            const gpu = selectGpu(snapshot, settings.gpuIndex);
            return {
                label: labelWithIndex("VRAM", gpu ? gpu.index : 0),
                value: formatPercent(gpu?.vramPct ?? null),
                graphValue: gpu?.vramPct ?? null,
                graphMax: 100,
                graphMinMax: null,
                graphMin: 0
            };
        }
        case "gpu-vram-used": {
            const gpu = selectGpu(snapshot, settings.gpuIndex);
            const vramTotal = toGibFromMaybeMb(gpu?.vramTotal ?? null);
            let vramUsed = toGibFromMaybeMb(gpu?.vramUsed ?? null);
            if (vramUsed === null && vramTotal !== null && typeof gpu?.vramPct === "number") {
                vramUsed = vramTotal * (gpu.vramPct / 100);
            }
            return {
                label: labelWithIndex("VRAM", gpu ? gpu.index : 0),
                value: formatGigabytes(vramUsed),
                graphValue: vramUsed,
                graphMax: vramTotal ?? null,
                graphMinMax: null,
                graphMin: 0
            };
        }
        case "gpu-temp": {
            const gpu = selectGpu(snapshot, settings.gpuIndex);
            return {
                label: gpu && gpu.index > 0 ? `GPU TEMP ${gpu.index + 1}` : "GPU TEMP",
                value: formatTempC(gpu?.tempC ?? null),
                graphValue: gpu?.tempC ?? null,
                graphMax: 100,
                graphMinMax: null,
                graphMin: 20
            };
        }
        case "gpu-power": {
            const gpu = selectGpu(snapshot, settings.gpuIndex);
            return {
                label: labelWithIndex("GPU", gpu ? gpu.index : 0),
                value: formatPower(gpu?.powerW ?? null),
                graphValue: gpu?.powerW ?? null,
                graphMax: null,
                graphMinMax: null,
                graphMin: 0
            };
        }
        case "gpu-top-compute": {
            const gpu = selectGpu(snapshot, settings.gpuIndex);
            const computePct = gpu?.topComputePct ?? null;
            if (settings.topThreshold > 0 && (computePct === null || !Number.isFinite(computePct) || computePct < settings.topThreshold)) {
                return { label: labelWithIndex("GPU TOP", gpu ? gpu.index : 0), value: "IDLE", graphValue: null, graphMax: 100, graphMinMax: null, graphMin: 0, idle: true };
            }
            return {
                label: labelWithIndex("GPU TOP", gpu ? gpu.index : 0),
                value: computePct !== null && Number.isFinite(computePct) ? `${Math.round(computePct)}%` : "--",
                graphValue: computePct,
                graphMax: 100,
                graphMinMax: null,
                graphMin: 0,
                processName: gpu?.topComputeName ?? null,
                processIcon: gpu?.topComputeIconBase64 ?? null
            };
        }
        case "mem-total": {
            return {
                label: "MEM",
                value: formatPercent(snapshot.memUsedPct),
                graphValue: snapshot.memUsedPct,
                graphMax: 100,
                graphMinMax: null,
                graphMin: 0
            };
        }
        case "mem-used": {
            const memUsed = toGibFromBytes(snapshot.memUsedBytes);
            const memTotal = toGibFromBytes(snapshot.memTotalBytes);
            return {
                label: "MEM",
                value: formatGigabytes(memUsed),
                graphValue: memUsed,
                graphMax: memTotal ?? null,
                graphMinMax: null,
                graphMin: 0
            };
        }
        case "disk-activity": {
            const perf = selectDiskPerf(snapshot, settings.diskId);
            const activity = perf?.activePct ?? snapshot.diskActivityPct;
            const disk = selectDisk(snapshot, settings.diskId);
            return {
                label: `${diskShortLabel(disk)} ACTIVE %`,
                value: formatPercent(activity),
                graphValue: activity,
                graphMax: 100,
                graphMinMax: null,
                graphMin: 0
            };
        }
        case "disk-used": {
            const disk = selectDisk(snapshot, settings.diskId);
            return {
                label: `${diskShortLabel(disk)} % USED`,
                value: formatPercent(disk?.usePct ?? null),
                graphValue: disk?.usePct ?? null,
                graphMax: 100,
                graphMinMax: null,
                graphMin: 0
            };
        }
        case "disk-free": {
            const disk = selectDisk(snapshot, settings.diskId);
            const freePct = typeof disk?.usePct === "number" ? 100 - disk.usePct : null;
            return {
                label: `${diskShortLabel(disk)} % FREE`,
                value: formatPercent(freePct),
                graphValue: freePct,
                graphMax: 100,
                graphMinMax: null,
                graphMin: 0
            };
        }
        case "disk-read": {
            const perf = selectDiskPerf(snapshot, settings.diskId);
            const readMB = bytesToMB(perf?.readBps ?? snapshot.diskThroughput.readBps);
            const disk = selectDisk(snapshot, settings.diskId);
            return {
                label: `${diskShortLabel(disk)} READ`,
                value: formatRateMB(readMB),
                graphValue: readMB,
                graphMax: null,
                graphMinMax: null,
                graphMin: 0
            };
        }
        case "disk-write": {
            const perf = selectDiskPerf(snapshot, settings.diskId);
            const writeMB = bytesToMB(perf?.writeBps ?? snapshot.diskThroughput.writeBps);
            const disk = selectDisk(snapshot, settings.diskId);
            return {
                label: `${diskShortLabel(disk)} WRITE`,
                value: formatRateMB(writeMB),
                graphValue: writeMB,
                graphMax: null,
                graphMinMax: null,
                graphMin: 0
            };
        }
        case "net-up": {
            const net = selectNet(snapshot, settings.netIface);
            const upMbit = bytesToMbit(net?.txBps ?? null);
            return {
                label: "NET UP",
                value: formatRateMbit(upMbit),
                graphValue: upMbit,
                graphMax: null,
                graphMinMax: 10,
                graphMin: 0
            };
        }
        case "net-down": {
            const net = selectNet(snapshot, settings.netIface);
            const downMbit = bytesToMbit(net?.rxBps ?? null);
            return {
                label: "NET DOWN",
                value: formatRateMbit(downMbit),
                graphValue: downMbit,
                graphMax: null,
                graphMinMax: 10,
                graphMin: 0
            };
        }
        case "net-total": {
            const transfer = statsPoller.getNetworkTransfer(settings.netPeriodSec, settings.netIface);
            return {
                label: `NET ${periodLabel(settings.netPeriodSec)}`,
                value: formatBytesShort(transfer.totalBytes),
                graphValue: null,
                graphMax: null,
                graphMinMax: null,
                graphMin: 0
            };
        }
        case "top-cpu": {
            const tp = snapshot.topProcess;
            if (settings.topThreshold > 0 && (tp.cpuPct === null || !Number.isFinite(tp.cpuPct) || tp.cpuPct < settings.topThreshold)) {
                return { label: "TOP CPU", value: "IDLE", graphValue: null, graphMax: 100, graphMinMax: null, graphMin: 0, idle: true };
            }
            return {
                label: "TOP CPU",
                value: tp.cpuPct !== null && Number.isFinite(tp.cpuPct) ? `${Math.round(tp.cpuPct)}%` : "--",
                graphValue: tp.cpuPct,
                graphMax: 100,
                graphMinMax: null,
                graphMin: 0,
                processName: tp.cpuName,
                processIcon: tp.cpuIconBase64
            };
        }
        case "top-mem": {
            const tp = snapshot.topProcess;
            if (settings.topThreshold > 0) {
                const totalMBCheck = (snapshot.memTotalBytes ?? 0) / (1024 * 1024);
                const pctCheck = tp.memMB !== null && totalMBCheck > 0 ? (tp.memMB / totalMBCheck) * 100 : null;
                if (pctCheck === null || pctCheck < settings.topThreshold) {
                    return { label: "TOP MEM", value: "IDLE", graphValue: null, graphMax: null, graphMinMax: null, graphMin: 0, idle: true };
                }
            }
            const memVal = tp.memMB !== null && Number.isFinite(tp.memMB)
                ? (tp.memMB >= 1024 ? `${(tp.memMB / 1024).toFixed(1)}G` : `${Math.round(tp.memMB)}M`)
                : "--";
            return {
                label: "TOP MEM",
                value: memVal,
                graphValue: tp.memMB,
                graphMax: null,
                graphMinMax: null,
                graphMin: 0,
                processName: tp.memName,
                processIcon: tp.memIconBase64
            };
        }
        case "top-mem-pct": {
            const tp = snapshot.topProcess;
            const totalMB = (snapshot.memTotalBytes ?? 0) / (1024 * 1024);
            const pct = tp.memMB !== null && totalMB > 0 ? (tp.memMB / totalMB) * 100 : null;
            if (settings.topThreshold > 0 && (pct === null || pct < settings.topThreshold)) {
                return { label: "TOP MEM %", value: "IDLE", graphValue: null, graphMax: 100, graphMinMax: null, graphMin: 0, idle: true };
            }
            return {
                label: "TOP MEM %",
                value: pct !== null && Number.isFinite(pct) ? `${Math.round(pct)}%` : "--",
                graphValue: pct,
                graphMax: 100,
                graphMinMax: null,
                graphMin: 0,
                processName: tp.memName,
                processIcon: tp.memIconBase64
            };
        }
        case "clock": {
            const now = new Date();
            return {
                label: "TIME",
                value: formatClock(now),
                graphValue: null,
                graphMax: null,
                graphMinMax: null,
                graphMin: null
            };
        }
        default:
            return {
                label: "STAT",
                value: "--",
                graphValue: null,
                graphMax: null,
                graphMinMax: null,
                graphMin: null
            };
    }
}
function buildGpuItems(snapshot) {
    if (snapshot.gpus.length === 0) {
        return [{ label: "GPU 1", value: "0" }];
    }
    return snapshot.gpus.map((gpu) => ({
        label: gpu.name || labelWithIndex("GPU", gpu.index),
        value: String(gpu.index)
    }));
}
function formatDiskSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0)
        return "";
    const size = bytes / (1024 * 1024 * 1024 * 1024);
    if (size < 10)
        return `${size.toFixed(1)}TB`;
    return `${Math.round(size)}TB`;
}
function buildDiskItems(snapshot) {
    if (snapshot.disks.length === 0) {
        return [{ label: "Disk", value: "" }];
    }
    const items = snapshot.disks.map((disk, index) => {
        const volume = disk.mount || disk.fs || "Disk";
        const labelParts = [`Disk ${index + 1}`, volume];
        const size = formatDiskSize(disk.size);
        if (size) {
            labelParts.push(size);
        }
        return {
            label: labelParts.join(" "),
            value: disk.id
        };
    });
    return items;
}
function buildNetItems(snapshot) {
    const items = [{ label: "All Interfaces", value: "" }];
    const interfaces = snapshot.netIfaces.length > 0 ? snapshot.netIfaces : [];
    for (const iface of interfaces) {
        if (iface.internal)
            continue;
        items.push({
            label: iface.ifaceName || iface.iface,
            value: iface.iface
        });
    }
    if (items.length === 1) {
        return [{ label: "All Interfaces", value: "" }];
    }
    return items;
}
function buildDataSourceItems(event, snapshot) {
    switch (event) {
        case "getGpus":
            return buildGpuItems(snapshot);
        case "getDisks":
            return buildDiskItems(snapshot);
        case "getNetIfaces":
            return buildNetItems(snapshot);
        default:
            return null;
    }
}
let MetricAction = (() => {
    let _classDecorators = [action({ UUID: "com.crest.simplestats.metric" })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = SingletonAction;
    (class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        states = new WeakMap();
        statesById = new Map();
        onWillAppear(ev) {
            if (!ev.action.isKey())
                return;
            const action = ev.action;
            const legacyDefaults = getLegacyDefaults(action.manifestId);
            if (legacyDefaults && !hasAnyMetricSettings(ev.payload.settings)) {
                void action.setSettings({ ...legacyDefaults });
            }
            const { state } = this.getState(action, ev.payload.settings);
            this.bumpDebug(state);
            log.info("willAppear", {
                manifestId: action.manifestId,
                settings: state.settings
            });
            writeDebugLog("willAppear", { actionId: action.id, manifestId: action.manifestId, settings: state.settings });
            statsPoller.setInterest(action.id, state.settings.group);
            state.unsubscribe = statsPoller.subscribe((snapshot) => {
                this.updateAction(action, state, snapshot);
            });
            void this.refreshSettings(action);
        }
        onWillDisappear(ev) {
            const state = this.statesById.get(ev.action.id) ?? this.states.get(ev.action);
            if (state) {
                saveHistoryToCache(state, ev.action.id, true);
                if (state.settingsReady) {
                    const cacheKey = state.cacheKey;
                    const bgId = `bg:${cacheKey}`;
                    const existing = backgroundStates.get(cacheKey);
                    if (existing) {
                        stopBackgroundState(cacheKey, existing);
                    }
                    backgroundStates.set(cacheKey, {
                        settings: state.settings,
                        settingsKey: state.settingsKey,
                        history: state.history,
                        lastRenderAt: state.lastRenderAt,
                        expiresAt: Date.now() + BACKGROUND_TTL_MS,
                        bgId,
                        cacheKey: state.cacheKey
                    });
                    statsPoller.setInterest(bgId, state.settings.group);
                    ensureBackgroundSubscription();
                }
            }
            if (state?.unsubscribe) {
                state.unsubscribe();
            }
            this.states.delete(ev.action);
            this.statesById.delete(ev.action.id);
            statsPoller.clearInterest(ev.action.id);
        }
        onDidReceiveSettings(ev) {
            if (!ev.action.isKey())
                return;
            const action = ev.action;
            const { state, changed } = this.getState(action, ev.payload.settings);
            this.bumpDebug(state);
            log.info("didReceiveSettings", {
                manifestId: action.manifestId,
                settings: state.settings
            });
            writeDebugLog("didReceiveSettings", { actionId: action.id, manifestId: action.manifestId, settings: state.settings });
            statsPoller.setInterest(action.id, state.settings.group);
            this.updateAction(action, state, statsPoller.getSnapshot(), changed);
        }
        async onPropertyInspectorDidAppear(ev) {
            // Don't send data here - wait for piReady signal from PI
            // This avoids race condition where PI listeners aren't ready yet
        }
        onSendToPlugin(ev) {
            const payload = ev.payload;
            if (!payload || typeof payload !== "object" || !payload.event)
                return;
            if (payload.event === "applySettings" && ev.action.isKey()) {
                if (payload.settings && typeof payload.settings === "object") {
                    const { state, changed } = this.getState(ev.action, payload.settings);
                    this.bumpDebug(state);
                    log.info("applySettings", {
                        manifestId: ev.action.manifestId,
                        settings: state.settings
                    });
                    writeDebugLog("applySettings", {
                        actionId: ev.action.id,
                        manifestId: ev.action.manifestId,
                        settings: state.settings
                    });
                    statsPoller.setInterest(ev.action.id, state.settings.group);
                    this.updateAction(ev.action, state, statsPoller.getSnapshot(), changed);
                }
                return;
            }
            // PI signals it's ready to receive data - send cached snapshot and save to settings
            if (payload.event === "piReady") {
                const snapshot = statsPoller.getSnapshot();
                this.sendDataSources(snapshot);
                // Also save device cache to settings so PI can load it instantly next time
                if (ev.action.isKey()) {
                    void this.saveDeviceCacheToSettings(ev.action, snapshot);
                }
                return;
            }
            // PI logging - forward to debug.log
            if (payload.event === "piLog" && typeof payload.message === "string") {
                writeDebugLog("PI", payload.message);
                return;
            }
            if (payload.event === "getGpus" || payload.event === "getDisks" || payload.event === "getNetIfaces") {
                const groups = payload.event === "getGpus" ? ["gpu"] : payload.event === "getDisks" ? ["disk"] : ["network"];
                void statsPoller.refreshNow({ forceGroups: groups })
                    .then((snapshot) => {
                    this.sendDataSources(snapshot, payload.event);
                })
                    .catch((err) => {
                    log.error("Failed to refresh data sources:", err);
                });
                return;
            }
            this.sendDataSources(statsPoller.getSnapshot(), payload.event);
        }
        getState(actionInstance, settings) {
            const legacyDefaults = getLegacyDefaults(actionInstance.manifestId);
            const mergedSettings = legacyDefaults ? { ...legacyDefaults, ...settings } : settings;
            const canRestoreHistory = hasAnyMetricSettings(mergedSettings);
            const normalized = normalizeSettings(mergedSettings);
            const nextKey = settingsKey(normalized);
            const existing = this.states.get(actionInstance);
            if (!existing) {
                pruneHistoryCache();
                const cacheKeyBase = historyCacheBaseKey(actionInstance);
                const cacheKey = historyCacheKey(cacheKeyBase, nextKey);
                const background = canRestoreHistory ? backgroundStates.get(cacheKey) : null;
                if (background) {
                    stopBackgroundState(cacheKey, background);
                }
                const cached = canRestoreHistory ? historyCache.get(cacheKey) : null;
                const reuseValues = cached && cached.settingsKey === nextKey ? cached.values : null;
                const state = {
                    settings: normalized,
                    settingsKey: nextKey,
                    cacheKeyBase,
                    cacheKey,
                    settingsReady: canRestoreHistory,
                    history: new HistorySeries(historyPointsForInterval(normalized.pollIntervalSec))
                };
                if (background && background.settingsKey === nextKey) {
                    state.history = background.history;
                    state.history.setMaxPoints(historyPointsForInterval(normalized.pollIntervalSec));
                    writeDebugLog("historyBackgroundRestore", { actionId: actionInstance.id, cacheKey });
                }
                else if (reuseValues) {
                    state.history.setValues(reuseValues);
                    historyCache.delete(cacheKey);
                    writeDebugLog("historyCacheRestore", { actionId: actionInstance.id, cacheKey });
                }
                if (settings?.metric !== undefined)
                    state.lastRawMetric = String(settings.metric);
                if (settings?.group !== undefined)
                    state.lastRawGroup = String(settings.group);
                this.states.set(actionInstance, state);
                this.statesById.set(actionInstance.id, state);
                return { state, changed: true };
            }
            const changed = existing.settingsKey !== nextKey;
            const prevSettings = existing.settings;
            if (existing.settingsKey !== nextKey) {
                existing.settings = normalized;
                existing.settingsKey = nextKey;
                const nextCacheKey = historyCacheKey(existing.cacheKeyBase, nextKey);
                const background = canRestoreHistory ? backgroundStates.get(nextCacheKey) : null;
                if (background) {
                    stopBackgroundState(nextCacheKey, background);
                    existing.history = background.history;
                    existing.history.setMaxPoints(historyPointsForInterval(normalized.pollIntervalSec));
                    writeDebugLog("historyBackgroundRestore", { actionId: actionInstance.id, cacheKey: nextCacheKey });
                }
                else {
                    const cached = canRestoreHistory ? historyCache.get(nextCacheKey) : null;
                    if (cached && cached.settingsKey === nextKey) {
                        existing.history = new HistorySeries(historyPointsForInterval(normalized.pollIntervalSec));
                        existing.history.setValues(cached.values);
                        historyCache.delete(nextCacheKey);
                        writeDebugLog("historyCacheRestore", { actionId: actionInstance.id, cacheKey: nextCacheKey });
                    }
                    else {
                        existing.history.setMaxPoints(historyPointsForInterval(normalized.pollIntervalSec));
                        existing.history.clear();
                    }
                }
                existing.cacheKey = nextCacheKey;
                writeDebugLog("settingsChanged", {
                    actionId: actionInstance.id,
                    manifestId: actionInstance.manifestId,
                    from: prevSettings,
                    to: normalized
                });
            }
            if (canRestoreHistory) {
                existing.settingsReady = true;
            }
            if (settings?.metric !== undefined)
                existing.lastRawMetric = String(settings.metric);
            if (settings?.group !== undefined)
                existing.lastRawGroup = String(settings.group);
            this.statesById.set(actionInstance.id, existing);
            return { state: existing, changed };
        }
        updateAction(actionInstance, state, snapshot, force = false) {
            if (!snapshot.osSupported) {
                void actionInstance.setTitle("WIN10+\nREQ");
                void actionInstance.setImage(undefined, { target: Target.HardwareAndSoftware });
                return;
            }
            if (!state.settingsReady) {
                return;
            }
            const now = Date.now();
            const intervalMs = intervalMsForSettings(state.settings);
            if (state.history.setMaxPoints(historyPointsForInterval(intervalMs / 1000))) {
                state.history.clear();
            }
            if (!force) {
                if (typeof state.lastRenderAt === "number" && now - state.lastRenderAt < intervalMs) {
                    return;
                }
            }
            state.lastRenderAt = now;
            const display = buildMetricDisplay(snapshot, state.settings);
            state.history.push(display.graphValue);
            saveHistoryToCache(state, actionInstance.id);
            const image = svgToDataUri(buildKeySvg(display, state.history, state.settings.group, state.settings));
            void actionInstance.setImage(image, { target: Target.HardwareAndSoftware });
            void actionInstance.setTitle("", {
                target: Target.HardwareAndSoftware
            });
            if (state.debugLogRemaining && state.debugLogRemaining > 0) {
                log.info("render", {
                    metric: state.settings.metric,
                    group: state.settings.group,
                    display,
                    gpuIndex: state.settings.gpuIndex
                });
                writeDebugLog("render", {
                    actionId: actionInstance.id,
                    manifestId: actionInstance.manifestId,
                    metric: state.settings.metric,
                    group: state.settings.group,
                    display,
                    gpuIndex: state.settings.gpuIndex
                });
                if (state.settings.group === "gpu") {
                    const gpu = selectGpu(snapshot, state.settings.gpuIndex);
                    log.info("gpuSnapshot", {
                        gpuIndex: state.settings.gpuIndex,
                        loadPct: gpu?.loadPct ?? null,
                        vramPct: gpu?.vramPct ?? null,
                        vramUsed: gpu?.vramUsed ?? null,
                        vramTotal: gpu?.vramTotal ?? null,
                        tempC: gpu?.tempC ?? null,
                        powerW: gpu?.powerW ?? null,
                        name: gpu?.name ?? null
                    });
                    writeDebugLog("gpuSnapshot", {
                        actionId: actionInstance.id,
                        manifestId: actionInstance.manifestId,
                        gpuIndex: state.settings.gpuIndex,
                        loadPct: gpu?.loadPct ?? null,
                        vramPct: gpu?.vramPct ?? null,
                        vramUsed: gpu?.vramUsed ?? null,
                        vramTotal: gpu?.vramTotal ?? null,
                        tempC: gpu?.tempC ?? null,
                        powerW: gpu?.powerW ?? null,
                        name: gpu?.name ?? null
                    });
                }
                if (state.settings.group === "disk") {
                    const disk = selectDisk(snapshot, state.settings.diskId);
                    const perf = selectDiskPerf(snapshot, state.settings.diskId);
                    writeDebugLog("diskSnapshot", {
                        actionId: actionInstance.id,
                        manifestId: actionInstance.manifestId,
                        diskId: state.settings.diskId,
                        disk: disk
                            ? { id: disk.id, mount: disk.mount, fs: disk.fs, size: disk.size, usePct: disk.usePct }
                            : null,
                        perfKeys: Object.keys(snapshot.diskPerfById || {}),
                        perf,
                        totalActivityPct: snapshot.diskActivityPct,
                        totalThroughput: snapshot.diskThroughput
                    });
                }
                state.debugLogRemaining -= 1;
            }
        }
        bumpDebug(state) {
            state.debugLogRemaining = 3;
        }
        async refreshSettings(actionInstance) {
            try {
                const settings = await actionInstance.getSettings();
                const { state, changed } = this.getState(actionInstance, settings);
                this.updateAction(actionInstance, state, statsPoller.getSnapshot(), changed);
            }
            catch (err) {
                log.error("Settings refresh failed, using cached state:", err);
            }
        }
        sendDataSources(snapshot, event) {
            if (event) {
                const items = buildDataSourceItems(event, snapshot);
                if (items) {
                    void streamDeck.ui.sendToPropertyInspector({ event, items });
                }
                return;
            }
            const events = ["getGpus", "getDisks", "getNetIfaces"];
            for (const name of events) {
                const items = buildDataSourceItems(name, snapshot);
                if (items) {
                    void streamDeck.ui.sendToPropertyInspector({ event: name, items });
                }
            }
        }
        async saveDeviceCacheToSettings(action, snapshot) {
            try {
                const gpus = buildDataSourceItems("getGpus", snapshot);
                const disks = buildDataSourceItems("getDisks", snapshot);
                const netIfaces = buildDataSourceItems("getNetIfaces", snapshot);
                const currentSettings = await action.getSettings();
                const newSettings = {
                    ...currentSettings,
                    _deviceCache: { gpus, disks, netIfaces }
                };
                await action.setSettings(newSettings);
                writeDebugLog("savedDeviceCache", {
                    gpus: gpus?.length ?? 0,
                    disks: disks?.length ?? 0,
                    netIfaces: netIfaces?.length ?? 0
                });
            }
            catch (err) {
                log.error("Failed to save device cache to settings:", err);
            }
        }
    });
    return _classThis;
})();
let LegacyStatAction = (() => {
    let _classDecorators = [action({ UUID: "com.crest.simplestats.stat" })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = MetricAction;
    (class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
    });
    return _classThis;
})();
let LegacyCpuAction = (() => {
    let _classDecorators = [action({ UUID: "com.crest.simplestats.cpu" })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = MetricAction;
    (class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
    });
    return _classThis;
})();
let LegacyGpuAction = (() => {
    let _classDecorators = [action({ UUID: "com.crest.simplestats.gpu" })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = MetricAction;
    (class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
    });
    return _classThis;
})();
let LegacyGpuTempAction = (() => {
    let _classDecorators = [action({ UUID: "com.crest.simplestats.gputemp" })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = MetricAction;
    (class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
    });
    return _classThis;
})();
let LegacyMemoryAction = (() => {
    let _classDecorators = [action({ UUID: "com.crest.simplestats.memory" })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = MetricAction;
    (class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
    });
    return _classThis;
})();
let LegacyDiskAction = (() => {
    let _classDecorators = [action({ UUID: "com.crest.simplestats.disk" })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = MetricAction;
    (class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
    });
    return _classThis;
})();
let LegacyNetworkAction = (() => {
    let _classDecorators = [action({ UUID: "com.crest.simplestats.network" })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = MetricAction;
    (class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
    });
    return _classThis;
})();

streamDeck.actions.registerAction(new MetricAction());
streamDeck.actions.registerAction(new LegacyStatAction());
streamDeck.actions.registerAction(new LegacyCpuAction());
streamDeck.actions.registerAction(new LegacyGpuAction());
streamDeck.actions.registerAction(new LegacyGpuTempAction());
streamDeck.actions.registerAction(new LegacyMemoryAction());
streamDeck.actions.registerAction(new LegacyDiskAction());
streamDeck.actions.registerAction(new LegacyNetworkAction());
streamDeck.connect();
// Pre-warm device caches so PI opens instantly
void statsPoller.refreshNow({ ensureGroups: ["gpu", "disk", "network"] });
//# sourceMappingURL=plugin.js.map
