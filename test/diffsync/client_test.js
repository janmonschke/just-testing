var assert        = require('assert'),
    sinon         = require('sinon'),
    _             = require('underscore'),
    jsondiffpatch = require('jsondiffpatch'),
    COMMANDS      = require('../../app/diffSync').COMMANDS,
    Client        = require('../../app/diffSync').Client;

describe('DiffSync Client', function(){

  var testClient = function(){
    return new Client({
      emit: function(){},
      on: function(){}
    }, 'testroom');
  };

  var testData = function(){
    return {a: 1, b: [{c: 1}]};
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

  describe('_onConnected', function(){
    var client;
    beforeEach(function(){
      client = testClient();
    });

    it('should set the model in initialized state', function(){
      assert(!client.initialized);
      client._onConnected({});
      assert(client.initialized);
    });

    it('should release the sync cycle', function(){
      client.initialize();
      assert(client.syncing);
      client._onConnected({});
      assert(!client.syncing);
    });

    it('should subscribe to server sync requests', function(){
      var spy = sinon.spy(client.socket, 'on');

      client._onConnected({});
      assert(spy.calledWith(COMMANDS.remoteUpdateIncoming, client.schedule));
    });

    it('should set the shadow and the local copy correctly', function(){
      client._onConnected({ test: true, arr: [{a: 1}] });
      assert.deepEqual(client.doc.localCopy, client.doc.shadow, 'both versions should be identical by value');
      assert.notStrictEqual(client.doc.localCopy, client.doc.shadow, 'they shouldnt be the same reference');
    });

    it('should trigger the `onConnected` callback', function(){
      var spy = sinon.spy(client, 'onConnected');

      client._onConnected({});
      assert(spy.calledOnce);
    });
  });

  describe('schedule', function(){
    var client;
    beforeEach(function(){
      client = testClient();
    });

    it('should schedule a sync', function(){
      assert(!client.scheduled);
      client.schedule();
      assert(client.scheduled);
    });

    it('should try to sync', function(){
      var spy = sinon.spy(client, 'syncWithServer');
      client.schedule();
      assert(spy.calledOnce);
    });
  });

  describe('createDiff', function(){
    it('should create an empty diff for equal objects', function(){
      var a = {test: true};
      var b = {test: true};
      var diff = testClient().createDiff(a, b);

      assert(_.isEmpty(diff));
    });

    it('should create an not empty diff for equal objects', function(){
      var a = {test: true, test2: true};
      var b = {test: true};
      var diff = testClient().createDiff(a, b);

      assert(!_.isEmpty(diff));
    });
  });

  describe('createDiffMessage', function(){
    it('should create a valid diff object', function(){
      var client        = testClient(),
          serverVersion = client.doc.serverVersion,
          diff          = {},
          baseVersion   = 1,
          diffMessage   = client.createDiffMessage(diff, baseVersion);

      assert.strictEqual(diffMessage.serverVersion, serverVersion);
      assert.strictEqual(diffMessage.localVersion, baseVersion);
      assert.strictEqual(diffMessage.diff, diff);
    });
  });


  describe('createEditMessage', function(){
    it('should create a valid edit message', function(){
      var client        = testClient(),
          baseVersion   = 1,
          editMessage   = client.createEditMessage(baseVersion);

      assert.equal(editMessage.room, client.room);
      assert.equal(editMessage.localVersion, baseVersion);
      assert.equal(editMessage.serverVersion, client.doc.serverVersion);
      assert.equal(editMessage.edits, client.edits);
    });
  });

  describe('syncWithServer', function(){
    var client, data, changeLocalDoc;
    beforeEach(function(){
      data = testData();
      client = testClient();
      client._onConnected(data);
    });

    changeLocalDoc = function(){
      client.doc.localCopy.b[0].c = 2;
    };

    it('should not sync if not initalized', function(){
      client.initialized = false;
      assert.equal(false, client.syncWithServer());
    });

    it('should not sync if currently syncing', function(){
      client.syncing = true;
      assert.equal(false, client.syncWithServer());
    });

    it('should reset the scheduled flag', function(){
      client.scheduled = true;
      changeLocalDoc();
      client.syncWithServer();
      assert.equal(false, client.scheduled);
    });

    it('should set syncing flag', function(){
      assert(!client.syncing);
      changeLocalDoc();
      client.syncWithServer();
      assert(client.syncing);
    });

    it('should perform a valid client-sync circle init', function(){
      var createDiff = sinon.spy(client, 'createDiff'),
          createDiffMessage = sinon.spy(client, 'createDiffMessage'),
          createEditMessage = sinon.spy(client, 'createEditMessage'),
          applyPatchTo = sinon.spy(client, 'applyPatchTo'),
          sendEdits = sinon.spy(client, 'sendEdits'),
          localVersionBeforeChange = client.doc.localVersion;

      // assert correct version
      assert.equal(client.doc.localVersion, 0, 'initial version number is 0');

      // change local version
      client.doc.localCopy.b[0].c = 2;
      client.syncWithServer();

      // creates a diff from shadow and local copy
      assert(createDiff.called, 'calls createDiff');
      assert(createDiff.calledWithExactly(client.doc.shadow, client.doc.localCopy), 'createDiff called with correct objects');

      // creates a diff message from that diff
      assert(createDiffMessage.calledAfter(createDiff), 'calls createDiffMessage after createDiff');

      // creates and edit message from that diff with correct local version
      assert(createEditMessage.calledAfter(createDiffMessage), 'calls createEditMessage after createDiffMessage');
      assert(createEditMessage.calledWithExactly(localVersionBeforeChange), 'createEditMessage is called with correct local version from before the change');

      // applies patch to shadow
      assert(applyPatchTo.calledAfter(createEditMessage), 'calls applyPatchTo after createEditMessage');
      assert.deepEqual(client.doc.shadow, client.doc.localCopy, 'applyPatchTo creates deep equality');

      assert.notStrictEqual(client.doc.shadow, client.doc.localCopy, 'shadow and local copy are equal, but not same references');
      assert.notStrictEqual(client.doc.shadow.b, client.doc.localCopy.b, 'shadow and local copy are equal, but not same references');
      assert.notStrictEqual(client.doc.shadow.b[0], client.doc.localCopy.b[0], 'shadow and local copy are equal, but not same references');

      // send the edits to the server
      assert(sendEdits.calledAfter(applyPatchTo), 'calls sendEdits after applyPatchTo');

      // assert correctly updated local version number
      assert.equal(client.doc.localVersion, 1, 'updated version number is 1');
    });
  });

  describe('applyServerEdit', function(){
    var client, edit, diff, serverData;

    beforeEach(function(){
      client = testClient();
      client._onConnected(testData());
      serverData = testData();
      serverData.b[0].c = 2;

      diff = JSON.parse(JSON.stringify(jsondiffpatch.diff(client.doc.localCopy, serverData)));
      edit = {
        localVersion: client.doc.localVersion,
        serverVersion: client.doc.serverVersion,
        diff: diff
      };
    });

    it('should apply the server changes and copy all values', function(){
      assert.notEqual(client.doc.localCopy.b[0].c, serverData.b[0].c, 'local version and remote version differ');
      client.applyServerEdit(edit);
      assert.equal(client.doc.localCopy.b[0].c, serverData.b[0].c, 'local version and remote version are equal');
      assert.deepEqual(client.doc.localCopy, client.doc.shadow, 'local version and shadow version are deep equal');
      assert.deepEqual(client.doc.localCopy.b[0], client.doc.shadow.b[0], 'local version and shadow version are not the same references');
    });
  });

});
