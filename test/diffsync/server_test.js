var assert        = require('assert'),
    sinon         = require('sinon'),
    _             = require('underscore'),
    jsondiffpatch = require('jsondiffpatch'),
    EventEmitter  = require('events').EventEmitter,
    COMMANDS      = require('../../app/diffSync').COMMANDS,
    Server        = require('../../app/diffSync').Server,
    Adapter       = require('../../app/diffSync').InMemoryDataAdapter;

describe('DiffSync Server', function(){
  var testRoom = 'testroom';
  var testAdapter = function(){
    return new Adapter({
      testroom: {testData: 1, testArray: [{awesome: true}]}
    });
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

  describe('getData', function(){
    var server;

    beforeEach(function(){
      server = testServer();
    });

    it('should return the correct data from the cache', function(){
      var data = {test: true},
          spy = sinon.spy(),
          adapterSpy = sinon.spy(server.adapter, 'getData');

      server.data[testRoom] = data;

      server.getData(testRoom, spy);

      assert(spy.called);
      assert(spy.calledWithExactly(data));
      assert(!adapterSpy.called, 'it should not call the adapter');
    });

    it('should go to adapter if cache is empty', function(){
      var data = {test: true},
          spy = sinon.spy(),
          adapterSpy = sinon.spy(server.adapter, 'getData');

      server.adapter.cache[testRoom] = data;
      server.getData(testRoom, spy);

      assert(spy.called, 'called the callback');
      assert(spy.args[0][0].serverCopy === data);

      assert(adapterSpy.called, 'alled the adapter');
      assert(adapterSpy.calledWith(testRoom));
    });

    it('should create the correct format for data internally', function(){
      var data = {test: true},
          spy = sinon.spy();

      server.adapter.cache[testRoom] = data;
      server.getData(testRoom, spy);

      assert(spy.called, 'called the callback');
      assert(_.isArray(server.data[testRoom].registeredSockets), 'correct data in `serverCopy`');
      assert(_.isObject(server.data[testRoom].clientVersions), 'correct data in `clientVersions`');
      assert(_.isObject(server.data[testRoom].serverCopy), 'correct data in `serverCopy`');
      assert(server.data[testRoom].serverCopy === data, 'correct value of data in `serverCopy`');
    });
  });

  describe('joinConnection', function(){

  });
});
