var assert = require('assert'),
    sinon  = require('sinon'),
    Client = require('../../app/diffSync').Client;

describe('DiffSync Client', function(){

  var testClient = function(){
    return new Client({
      emit: function(){},
      on: function(){}
    }, 'testroom');
  };

  describe('constructor', function(){
    it('should throw if no socket passed', function(){
      assert.throws(function(){
        new Client();
      }, Error);

      assert.doesNotThrow(function() {
        testClient();
      });
    });

    it('should set a default room', function(){
      assert.notStrictEqual(testClient().room, null);
      assert.notStrictEqual(testClient().room, undefined);
    });
  });

  describe('initialize', function(){
    it('should connect to the correct room', function(){
      var c   = testClient(),
          spy = sinon.spy(c.socket, 'emit');

      c.initialize();

      assert(spy.called);
      assert(spy.calledWith('join', c.room));
    });
  });

});
