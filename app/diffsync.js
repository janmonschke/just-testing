var _             = require('underscore'),
    jsondiffpatch = require('jsondiffpatch').create({
      objectHash: function(obj) { return obj.id || obj._id || JSON.stringify(obj); }
    }),
    COMMANDS      = {
      join: 'join',
      syncWithServer: 'send-edit',
      remoteUpdateIncoming: 'updated-doc'
    },
    utils, Client, Server, InMemoryDataAdapter;

utils = {
  deepCopy: function(obj){
    return JSON.parse(JSON.stringify(obj));
  }
};

Client = function(socket, room){
  if(!socket){ throw new Error('No socket specified'); }
  if(!room){ room = ''; }

  this.socket = socket;
  this.room = room;
  this.syncing = false;
  this.initialized = false;
  this.scheduled = false;
  this.doc = {
    localVersion: 0,
    serverVersion: 0,
    shadow: {},
    localCopy: {},
    diffs: []
  };

  _.bindAll(this, '_onConnected', 'syncWithServer', 'applyServerEdit', 'applyServerEdits');
};

/**
 * Get the data
 * @return {Object} [description]
 */
Client.prototype.getData = function(){
  return this.doc.localCopy;
};

/**
 * Initializes the sync session
 * @return {[type]} [description]
 */
Client.prototype.initialize = function(){
  // connect, join room and initialize
  this.syncing = true;
  this.socket.emit(COMMANDS.join, this.room, this._onConnected);
};

/**
 * Sets up the local version and listens to server updates
 * Will notify the `onConnected` callback.
 * @param  {Object} initialVersion The initial version from the server
 */
Client.prototype._onConnected = function(initialVersion){
  // client is not syncing anymore and is initialized
  this.syncing = false;
  this.initialized = true;

  // set up shadow doc, local doc and initial server version
  // IMPORTANT: the shadow needs to be a deep copy of the initial version
  // because otherwise changes to the local object will also result in changes
  // to the shadow object because they are pointing to the same doc
  this.doc.shadow = utils.deepCopy(initialVersion);
  this.doc.localCopy = initialVersion;
  this.doc.serverVersion = 0;

  // listen to incoming updates from the server
  this.socket.on(COMMANDS.remoteUpdateIncoming, this.schedule);

  // notify about established connection
  this.onConnected();
};

/**
 * Schedule a sync cycle. This method should be used from the outside to
 * trigger syncs.
 */
Client.prototype.schedule = function(){
  // do nothing if already scheduled
  if(this.scheduled){ return; }
  this.scheduled = true;

  // try to sync now
  this.syncWithServer();
};

/**
 * Starts a sync cycle. Should not be called from third parties
 */
Client.prototype.syncWithServer = function(){
  if(this.syncing || !this.initialized){ return false; }
  if(this.scheduled){ this.scheduled = false; }

  // initiate syncing cycle
  this.syncing = true;

  // 1) create a diff of local copy and shadow
  var diff = this.createDiff(this.doc.shadow, this.doc.localCopy);
  var basedOnLocalVersion = this.doc.localVersion;

  // 2) add the difference to the local edits stack if the diff is not empty
  if(!_.isEmpty(diff)){
    this.doc.diffs.push(this.createDiffMessage(diff, basedOnLocalVersion));
    this.doc.localVersion++;
  }

  // 3) create an edit message with all relevant version numbers
  var editMessage = this.createEditMessage(basedOnLocalVersion);

  // 4) apply the patch to the local shadow
  this.applyPatchTo(this.doc.shadow, utils.deepCopy(diff));

  // 5) send the edits to the server
  this.sendEdits(editMessage);

  // yes, we're syncing
  return true;
};

/**
 * Returns a diff of the passed documents
 * @param  {Object} docA
 * @param  {Object} docB
 * @return {Diff}      The diff of both documents
 */
Client.prototype.createDiff = function(docA, docB){
  return jsondiffpatch.diff(docA, docB);
};

/**
 * Applies the path to the specified object
 * WARNING: The patch is applied in place!
 * @param  {Object} obj
 * @param  {Diff} patch
 */
Client.prototype.applyPatchTo = function(obj, patch){
  jsondiffpatch.patch(obj, patch);
};

/**
 * Creates a message for the specified diff
 * @param  {Diff} diff          the diff that will be sent
 * @param  {Number} baseVersion the version of which the diff is based
 * @return {Object}             a diff message
 */
Client.prototype.createDiffMessage = function(diff, baseVersion){
  return {
    serverVersion: this.doc.serverVersion,
    localVersion: baseVersion,
    diff: diff
  };
};

/**
 * Creates a message representing a set of edits
 * An edit message contains all edits since the last sync has happened.
 * @param  {Number} baseVersion The version that these edits are based on
 * @return {Object}             An edit message
 */
Client.prototype.createEditMessage = function(baseVersion){
  return {
    room: this.room,
    edits: this.doc.edits,
    localVersion: baseVersion,
    serverVersion: this.doc.serverVersion
  };
};

/**
 * Send the the edits to the server and applies potential updates from the server
 */
Client.prototype.sendEdits = function(editMessage){
  this.socket.emit(COMMANDS.syncWithServer, editMessage, this.applyServerEdits);
};

/**
 * Applies all edits from the server and notfies about changes
 * @param  {Object} serverEdits The edits message
 */
Client.prototype.applyServerEdits = function(serverEdits){
  if(serverEdits && serverEdits.localVersion === this.doc.localVersion){
    // 0) delete all previous edits
    this.doc.edits = [];
    // 1) iterate over all edits
    serverEdits.edits.forEach(this.applyServerEdit);
  }else{
    // Rejected patch because localVersions don't match
    this.onError('REJECTED_PATCH');
  }

  // we are not syncing any more
  this.syncing = false;

  // notify about sync
  this.onSynced();

  // if a sync has been scheduled, sync again
  if(this.scheduled) {
    this.syncWithServer();
  }
};

/**
 * Applies a single edit message to the local copy and the shadow
 * @param  {[type]} editMessage [description]
 * @return {[type]}             [description]
 */
Client.prototype.applyServerEdit =  function(editMessage){
  // 2) check the version numbers
  if(editMessage.localVersion === this.doc.localVersion &&
    editMessage.serverVersion === this.doc.serverVersion){

    if(!_.isEmpty(editMessage.diff)){
      // versions match
      // 3) patch the shadow
      this.applyPatchTo(this.doc.shadow, editMessage.diff);

      // 4) increase the version number for the shadow if diff not empty
      this.doc.serverVersion++;
      // apply the patch to the local document
      // IMPORTANT: Use a copy of the diff, or newly created objects will be copied by reference!
      this.applyPatchTo(this.doc.localCopy, utils.deepCopy(editMessage.diff));
    }

    return true;
  }else{
    // TODO: check in the algo paper what should happen in the case of not matching version numbers
    return false;
  }
};

Client.prototype.onConnected = _.noop;
Client.prototype.onSynced = _.noop;
Client.prototype.onError = _.noop;

Server = function(adapter, transport){
  if(!(adapter && transport)){ throw new Error('Need to specify an adapter and a transport'); }

  this.adapter = adapter;
  this.transport = transport;
  this.data = {};

  _.bindAll(this, 'trackConnection');
};

Server.prototype.initialize = function(){
  this.transport.on('connection', this.trackConnection);
};

/**
 * Registers the correct event listeners
 * @param  {Connection} connection The connection that should get tracked
 */
Server.prototype.trackConnection = function(connection){
  var withConnection = function(context, actual){
    return function(){
      var args = _.toArray(arguments);
      args.unshift(connection);
      actual.apply(context, args);
    };
  };

  connection.on(COMMANDS.join, withConnection(this, this.joinConnection));
  connection.on(COMMANDS.syncWithServer, withConnection(this, this.receiveEdit));
};

/**
 * Joins a connection to a room and send the initial data
 * @param  {Connection} connection
 * @param  {String} room             room identifier
 * @param  {Function} initializeClient Callback that is being used for initialization of the client
 */
Server.prototype.joinConnection = function(connection, room, initializeClient){
  this.getData(room, function(error, data){
    connection.join(room);

    initializeClient(data.serverCopy);
  });
};

Server.prototype.prepareClientData = function(data){
  doc.clientVersions[socketId] = {
    backup: {
      doc: deepCopy(baseDoc),
      serverVersion: 0
    },
    shadow: {
      doc: deepCopy(baseDoc),
      serverVersion: 0,
      localVersion: 0
    },
    edits: []
  };

  send({
    doc: baseDoc,
    version: 0
  });
};

/**
 * Gets data for a room from the internal cache or from the adapter
 * @param  {String}   room     room identifier
 * @param  {Function} callback notifier-callback
 */
Server.prototype.getData = function(room, callback){
  var cachedVersion = this.data[room],
      cache = this.data;

  if(cachedVersion){
    callback(cachedVersion);
  }else{
    this.adapter.getData(room, function(error, data){
      // don't override if created in meantime
      if(!cache[room]){
        cache[room] = {
          registeredSockets: [],
          clientVersions: {},
          serverCopy: data
        };
      }

      callback(cache[room]);
    });
  }
};

Server.prototype.receiveEdit = function(connection, edit, sendToClient){

};

/**
 * A dumb in-memory data store. Do not use in production.
 * Only for demo purposes.
 * @param {Object} cache
 */
InMemoryDataAdapter = function(cache){
  // `stores` all data
  this.cache = cache || {};
};

/**
 * Get the data specified by the id
 * @param  {String/Number}   id ID for the requested data
 * @param  {Function} cb
 */
InMemoryDataAdapter.prototype.getData = function(id, cb){
  var data = this.cache[id];
  if(!data){
    this.cache[id] = {};
  }
  cb(null, this.cache[id]);
};

/**
 * Stores `data` at `id`
 */
InMemoryDataAdapter.storeData = function(id, data, cb){
  this.cache[id] = data;
  cb(null);
};

module.exports = {
  Client: Client,
  Server: Server,
  InMemoryDataAdapter: InMemoryDataAdapter,
  COMMANDS: COMMANDS
};
