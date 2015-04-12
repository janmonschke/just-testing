var assert        = require('assert'),
    sinon         = require('sinon'),
    _             = require('underscore'),
    jsondiffpatch = require('jsondiffpatch'),
    EventEmitter  = require('events').EventEmitter,
    COMMANDS      = require('../../app/diffSync').COMMANDS,
    Server        = require('../../app/diffSync').Server,
    Adapter       = require('../../app/diffSync').InMemoryDataAdapter;

describe('DiffSync Server', function(){
  var testAdapter = function(){
    return new Adapter();
  };
  var testTransport = function(){
    return {
      on: function(){}
    };
  };
  var testServer = function(){
    return new Server(testAdapter(), testTransport());
  };

  describe('constructor', function(){
    it('should throw if no adapter or transport is passed', function(){
      assert.throws(function(){
        new Server();
      });

      assert.throws(function(){
        new Server(testAdapter());
      });

      assert.doesNotThrow(function(){
        new Server(testAdapter(), testTransport());
      });
    });
  });

  describe('trackConnection', function(){
    var connection;

    beforeEach(function(){
      connection = new EventEmitter();
    });

    it('should bind the callbacks properly', function(){
      var server = testServer(),
          joinSpy = sinon.stub(server, 'joinConnection', function(){}),
          syncSpy = sinon.stub(server, 'receiveEdit', function(){}),
          testRoom = 'testroom',
          testEdit = {},
          testCb = function(){};

      server.trackConnection(connection);

      connection.emit(COMMANDS.join, testRoom, testCb);

      assert(joinSpy.called);
      assert(joinSpy.calledWithExactly(connection, testRoom, testCb));
      assert(joinSpy.calledOn(server));

      connection.emit(COMMANDS.syncWithServer, testEdit, testCb);

      assert(syncSpy.called);
      assert(syncSpy.calledWithExactly(connection, testEdit, testCb));
      assert(syncSpy.calledOn(server));
    });
  });
});
