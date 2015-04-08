var _       = require('underscore'),
  COMMANDS  = {
    syncWithServer: 'send-edit',
    getInitialVersion: 'get-latest-document-version',
    remoteUpdateIncoming: 'updated-doc'
  },
  Client;

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
    edits: []
  };

  _.bindAll(this, '_onConnected');
};

Client.prototype.initialize = function(){
  // connect, join room and initialize
  this.socket.emit('join', this.room, this._onConnected);
};

Client.prototype._onConnected = function(){
  this.socket.emit('ack', { data: [1, 2, 3], room: this.room });
};

module.exports = {
  Client: Client
};
