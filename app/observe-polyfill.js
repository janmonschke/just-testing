// C: Joshua Bell - https://gist.github.com/inexorabletash/8010316
// Polyfill for ES7 Object.observe()

// Limitations:
//  - No 'splice' (etc); if you're observing an Array, you're gonna have a bad time

(function(global) {
  function assert(e) { if (!e) throw new Error('Assertion failed'); }
  // http://wiki.ecmascript.org/doku.php?id=harmony:observe

  // ECMAScript internal approximations
  function Type(o) {
    if (o === null) return 'null';
    switch (typeof o) {
      case 'undefined': return 'undefined';
      case 'boolean': return 'boolean';
      case 'number': return 'number';
      case 'string': return 'string';
      default: return 'object';
    }
  }
  assert(Type(null) === 'null');
  assert(Type(assert) === 'object');

  function IsCallable(o) { return typeof o === 'function'; }
  assert(!IsCallable(1));
  assert(IsCallable(assert));

  function ToUint32(x) { return x >>> 0; }
  assert(ToUint32(-1) === 0xffffffff);
  assert(ToUint32('abc') === 0);

  function SameValue(a, b) {
    if (a === b) return a !== 0 || 1 / a === 1 / b;
    return a !== a && b !== b;
  }
  assert(SameValue(1, 1));
  assert(!SameValue(1, '1'));
  assert(SameValue(0, 0));
  assert(!SameValue(0, -0));
  assert(!SameValue(null, undefined));
  assert(!SameValue(null, NaN));
  assert(SameValue(NaN, NaN));

  function IsDataDescriptor(desc) {
    if (desc === undefined) return false;
    if (!('value' in desc) && !('writable' in desc)) return false;
    return true;
  }
  assert(IsDataDescriptor(Object.getOwnPropertyDescriptor({x: 1}, 'x')));

  function GetOwnProperty(o, p) {
    return Object.prototype.hasOwnProperty.call(o, p) ? o[p] : undefined;
  }
  assert(GetOwnProperty({x: 1}, 'x') === 1);
  assert(GetOwnProperty({}, 'x') === undefined);
  assert(GetOwnProperty({}, 'toString') === undefined);


  // ------------------------------------------------------------
  // Object.observe: New Internal Properties, Objects and Algorithms
  // ------------------------------------------------------------
  // http://wiki.ecmascript.org/doku.php?id=harmony:observe_internals

  // [[ObserverCallbacks]]
  var __ObserverCallbacks__ = []; // per event queue

  // [[NotifierPrototype]]
  var __NotifierPrototype__ = {};

  // [[NotifierPrototype]].notify
  __NotifierPrototype__.notify = function() {
    var changeRecord = arguments[0];
    var notifier = this;
    if (Type(notifier) !== 'object') throw new TypeError;
    if (!('[[Target]]' in notifier)) return;
    var type = changeRecord['type'];
    if (Type(type) !== 'string') throw new TypeError;
    var changeObservers = notifier['[[ChangeObservers]'];
    if (!changeObservers.length) return;
    var target = notifier['[[Target]]'];
    var newRecord = {};
    Object.defineProperty(newRecord, 'object', {
      value: target, writable: false, enumerable: true, configurable: false
    });
    for (var n in changeRecord) {
      if (n !== 'object') {
        var value = changeRecord[n];
        Object.defineProperty(newRecord, n, {
          value: value, writable: false, enumerable: true, configurable: false
        });
      }
    }
    Object.preventExtensions(newRecord);
    __EnqueueChangeRecord__(target, newRecord);
  };

  // [[NotifierPrototype]].performChange
  __NotifierPrototype__.performChange = function() {
    var changeType = arguments[0];
    var changeFn = arguments[1];
    var notifier = this;
    if (Type(notifier) !== 'object') throw new TypeError;
    if (!('[[Target]]' in notifier)) return;
    var target = notifier['[[Target]]'];
    if (Type(changeType) !== 'string') throw new TypeError;
    if (!IsCallable(changeFn)) throw new TypeError;
    __BeginChange__(target, changeType);
    try { var changeRecord = changeFn.call(undefined); }
    catch (e) { var error = e; }
    __EndChange__(target, changeType);
    if (error !== undefined) throw error;
    var changeObservers = notifier['[[ChangeObservers]]'];
    if (!changeObservers.length) return;
    var newRecord = {};
    Object.defineProperty(newRecord, 'object', {
      value: target, writable: false, enumerable: true, configurable: false
    });
    Object.defineProperty(newRecord, 'type', {
      value: changeType, writable: false, enumerable: true, configurable: false
    });
    for (var n in changeRecord) {
      if (n !== 'object' && n !== 'type') {
        var value = changeRecord[n];
        Object.defineProperty(newRecord, n, {
          value: value, writable: false, enumerable: true, configurable: false
        });
      }
    }
    Object.preventExtensions(newRecord);
    __EnqueueChangeRecord__(target, newRecord);
  };

  // [[GetNotifier]]
  function __GetNotifier__(o) {
    var notifier = o['[[Notifier]]'];
    if (notifier === undefined) {
      notifier = {};
      notifier.__proto__ = __NotifierPrototype__;
      notifier['[[Target]]'] = o;
      notifier['[[ChangeObservers]]'] = [];
      notifier['[[ActiveChanges]]'] = {};
      Object.defineProperty(o, '[[Notifier]]', {
        value: notifier, enumerable: false, configurable: true, writable: true
      });
    }
    return notifier;
  }

  // [[BeginChange]]
  function __BeginChange__(o, changeType) {
    var notifier = __GetNotifier__(o);
    var activeChanges = notifier['[[ActiveChanges]]'];
    var changeCount = activeChanges[changeType];
    if (changeCount === undefined) changeCount = 1;
    else changeCount = changeCount + 1;
    activeChanges[changeType] = changeCount;
  }

  // [[EndChange]]
  function __EndChange__(o, changeType) {
    var notifier = __GetNotifier__(o);
    var activeChanges = notifier['[[ActiveChanges]]'];
    var changeCount = activeChanges[changeType];
    assert(changeCount > 0);
    changeCount = changeCount - 1;
    activeChanges[changeType] = changeCount;
  }

  // [[ShouldDeliverToObserver]]
  function __ShouldDeliverToObserver__(activeChanges, acceptList, changeType) {
    var doesAccept = false;
    for (var i = 0; i < acceptList.length; ++i) {
      var accept = acceptList[i];
      if (activeChanges[accept] > 0) return false;
      if (accept === changeType)
        doesAccept = true;
    }
    return doesAccept;
  }

  // [[EnqueueChangeRecord]]
  function __EnqueueChangeRecord__(o, changeRecord) {
    var notifier = __GetNotifier__(o);
    var changeType = changeRecord['type'];
    var activeChanges = notifier['[[ActiveChanges]]'];
    var changeObservers = notifier['[[ChangeObservers]]'];
    for (var i = 0; i < changeObservers.length; ++i) {
      var observerRecord = changeObservers[i];
      var acceptList = observerRecord['accept'];
      var deliver = __ShouldDeliverToObserver__(activeChanges,
                                                acceptList,
                                                changeType);
      if (!deliver) continue;
      var observer = observerRecord['callback'];

      observer['[[PendingChangeRecords]]'] =
        observer['[[PendingChangeRecords]]'] || [];

      var pendingRecords = observer['[[PendingChangeRecords]]'];
      pendingRecords.push(changeRecord);
    }
  }

  // [[DeliverChangeRecords]]
  function __DeliverChangeRecords__(c) {
    var changeRecords = c['[[PendingChangeRecords]]'] || [];
    c['[[PendingChangeRecords]]'] = [];
    var array = [];
    var n = 0;
    for (var i = 0; i < changeRecords.length; ++i) {
      var record = changeRecords[i];
      Object.defineProperty(array, String(n), {
        value: record, writable: true, enumerable: true, configurable: true
      });
      ++n;
    }
    if (!array.length) return false;
    try { c.call(undefined, array); } catch (e) {}
    return true;
  }

  // [[DeliverAllChangeRecords]]
  function __DeliverAllChangeRecords__() {
    var observers = __ObserverCallbacks__;
    var anyWorkDone = false;
    for (var i = 0; i < observers.length; ++i) {
      var observer = observers[i];
      var result = __DeliverChangeRecords__(observer);
      if (result) anyWorkDone = true;
    }
    return anyWorkDone;
  }

  // [[CreateChangeRecord]]
  function __CreateChangeRecord__(type, object, name, oldDesc, newDesc) {
    var changeRecord = {};
    Object.defineProperty(changeRecord, 'type', {
      value: type, writable: false, enumerable: true, configurable: false
    });
    Object.defineProperty(changeRecord, 'object', {
      value: object, writable: false, enumerable: true, configurable: false
    });
    if (Type(name) === 'string') {
      Object.defineProperty(changeRecord, 'name', {
        value: name, writable: false, enumerable: true, configurable: false
      });
    }
    if (IsDataDescriptor(oldDesc)) {
      if (!IsDataDescriptor(newDesc) ||
          !SameValue(oldDesc.value, newDesc.value)) {
        Object.defineProperty(changeRecord, 'oldValue', {
          value: oldDesc.value,
          writable: false, enumerable: true, configurable: false
        });
      }
    }
    Object.preventExtensions(changeRecord);
    return changeRecord;
  }

  // [[CreateSpliceChangeRecord]]
  function __CreateSpliceChangeRecord__(object, index, removed, addedCount) {
    var changeRecord = {};
    Object.defineProperty(changeRecord, 'type', {
      value: 'splice', writable: false, enumerable: true, configurable: false
    });
    Object.defineProperty(changeRecord, 'object', {
      value: object, writable: false, enumerable: true, configurable: false
    });
    Object.defineProperty(changeRecord, 'index', {
      value: index, writable: false, enumerable: true, configurable: false
    });
    Object.defineProperty(changeRecord, 'removed', {
      value: removed, writable: false, enumerable: true, configurable: false
    });
    Object.defineProperty(changeRecord, 'addedCount', {
      value: addedCount, writable: false, enumerable: true, configurable: false
    });
    Object.preventExtensions(changeRecord);
    return changeRecord;
  }


  // ------------------------------------------------------------
  // Object.observe: Public API Specification
  // ------------------------------------------------------------
  // http://wiki.ecmascript.org/doku.php?id=harmony:observe_public_api

  function defineAPI(o, name, fn) {
    if (!Object.getOwnPropertyDescriptor(o, name)) {
      Object.defineProperty(o, name, {
        value: fn, writable: true, enumerable: false, configurable: true
      });
    }
  }

  defineAPI(Object, 'observe', function observe(o, callback, accept) {
    if (Type(o) !== 'object') throw new TypeError;
    if (!IsCallable(callback)) throw new TypeError;
    if (Object.isFrozen(callback)) throw new TypeError;

    if (accept === undefined) {
      var acceptList = ['add',
                        'update',
                        'delete',
                        'setPrototype',
                        'reconfigure',
                        'preventExtensions'];
    } else {
      acceptList = [];
      if (Type(accept) !== 'object') throw new TypeError;
      var lenValue = accept.length;
      var len = ToUint32(lenValue);
      var nextIndex = 0;
      while (nextIndex < len) {
        var next = accept[nextIndex];
        var nextString = String(next);
        acceptList.push(nextString);
        nextIndex = nextIndex + 1;
      }
    }
    var notifier = __GetNotifier__(o);
    var changeObservers = notifier['[[ChangeObservers]]'];
    for (var i = 0; i < changeObservers.length; ++i) {
      var record = changeObservers[i];
      if (record.callback === callback) {
        record.accept = acceptList;
        return o;
      }
    }

    // Register for polling
    poly.watch(o, callback);

    var observerRecord = {};
    observerRecord.callback = callback;
    observerRecord.accept = acceptList;
    changeObservers.push(observerRecord);
    var observerCallbacks = __ObserverCallbacks__;
    if (observerCallbacks.indexOf(callback) !== -1)
      return o;
    observerCallbacks.push(callback);
    return o;
  });

  defineAPI(Object, 'unobserve', function unobserve(o, callback) {
    if (Type(o) !== 'object') throw new TypeError;
    if (!IsCallable(callback)) throw new TypeError;
    var notifier = __GetNotifier__(o);
    var changeObservers = notifier['[[ChangeObservers]]'];
    for (var i = 0; i < changeObservers.length; ++i) {
      var record = changeObservers[i];
      if (record.callback === callback) {
        changeObservers.splice(i, 1);

        // Unregister for polling
        poly.unwatch(o, callback);

        return o;
      }
    }
    return o;
  });

  defineAPI(Array, 'observe', function observe(o, callback) {
    return Object.observe(o, callback, ['add', 'update', 'delete', 'splice']);
  });
  defineAPI(Array, 'unobserve', function unobserve(o, callback) {
    return Object.unobserve(o, callback);
  });

  defineAPI(Object, 'deliverChangeRecords',
            function deliverChangeRecords(callback) {
    if (!IsCallable(callback)) throw new TypeError;

    // Slip in another sample
    poly.sample();

    while (__DeliverChangeRecords__(callback))
      continue;
    return;
  });

  defineAPI(Object, 'getNotifier', function getNotifier(o) {
    if (Type(o) !== 'object') throw new TypeError;
    if (Object.isFrozen(o)) return null;
    return __GetNotifier__(o);
  });


  // ------------------------------------------------------------
  // Polyfill Hackery
  // ------------------------------------------------------------

  var poly = (function() {
    var poly = {};

    var multimap = []; // Is a set of pairs <o, callback>
    var snapshots = []; // TODO: use a Map (polyfill) for snapshots

    poly.watch = function(o, callback) {
      multimap.push([o, callback]);
      for (var i = 0; i < snapshots.length; ++i) {
        if (snapshots[i][0] === o) return;
      }
      snapshots.push([o, makeSnapshot(o)]);
    };

    poly.unwatch = function(o, callback) {
      for (var i = 0; i < multimap.length; ++i) {
        if (multimap[i][0] === o && multimap[i][1] === callback) {
          multimap.splice(i, 1);
          break;
        }
      }
      for (i = 0; i < multimap.length; ++i) {
        if (multimap[i][0] === o) return;
      }
      for (i = 0; i < snapshots.length; ++i) {
        if (snapshots[i][0] === o) {
          snapshots.splice(i, 1);
          break;
        }
      }
    };

    function makeSnapshot(o) {
      var ss = { descriptors: {} };
      Object.getOwnPropertyNames(o).forEach(function(name) {
        ss.descriptors[name] = Object.getOwnPropertyDescriptor(o, name);
      });
      ss.isExtensible = Object.isExtensible(o);
      ss.prototype = Object.getPrototypeOf(o);
      return ss;
    }

    // TODO: 'splice' (via shimming intrinsics?)

   poly.sample = function() {
      snapshots.forEach(function(pair) {
        var o = pair[0];
        var oldSS = pair[1];
        var newSS = makeSnapshot(o); // TODO: Incrementally?
        pair[1] = newSS;

        Object.keys(oldSS.descriptors).forEach(function(name) {
          if (name === '[[Notifier]]') return;
          var oldDesc = GetOwnProperty(oldSS.descriptors, name);
          var newDesc = GetOwnProperty(newSS.descriptors, name);

          if (!newDesc) {
            var r = __CreateChangeRecord__('delete', o, name, oldDesc, newDesc);
            __EnqueueChangeRecord__(o, r);
            return;
          }

          if (['value', 'get', 'set', 'configurable', 'writable', 'enumerable'
              ].every(function(p) { return oldDesc[p] === newDesc[p]; })) {
            return;
          }
          var changeType = 'reconfigure';

          if (IsDataDescriptor(oldDesc) && IsDataDescriptor(newDesc) &&
              !SameValue(oldDesc.value, newDesc.value)) {
              changeType = 'update';
          }

          r = __CreateChangeRecord__(changeType, o, name, oldDesc, newDesc);
          __EnqueueChangeRecord__(o, r);

        });
        Object.keys(newSS.descriptors).forEach(function(name) {
          if (name === '[[Notifier]]') return;
          var oldDesc = GetOwnProperty(oldSS.descriptors, name);
          var newDesc = GetOwnProperty(newSS.descriptors, name);

          if (!oldDesc) {
            var r = __CreateChangeRecord__('add', o, name, oldDesc, newDesc);
            __EnqueueChangeRecord__(o, r);
          }
        });

        if (oldSS.isExtensible !== newSS.isExtensible) {
          var r = __CreateChangeRecord__('preventExtensions', o);
          __EnqueueChangeRecord__(o, r);
        }

        if (oldSS.prototype !== newSS.prototype) {
          r = {};
          Object.defineProperty(r, 'type', {
            value: 'setPrototype',
            writable: false, enumerable: true, configurable: false
          });
          Object.defineProperty(r, 'object', {
            value: o,
            writable: false, enumerable: true, configurable: false
          });
          Object.defineProperty(r, 'oldValue', {
            value: oldSS.prototype,
            writable: false, enumerable: true, configurable: false
          });
          Object.preventExtensions(r);
          __EnqueueChangeRecord__(o, r);
        }
      });

      __DeliverAllChangeRecords__();
    };

    var POLL_FREQUENCY = 100; // ms
    setInterval(poly.sample, POLL_FREQUENCY);

    return poly;
  }());

}(this));