var ObserveJS = require('observe-js'),
    Backbone  = require('backbone'),
    _         = require('underscore'),
    View      = require('./view');

module.exports = View.extend({
  initialize: function(){
    View.prototype.initialize.apply(this, arguments);

    if (_.isArray(this.model)) {
      this._observer = new ObserveJS.ArrayObserver(this.model);
      // Array.observe(this.model, function(){
      //   console.log(name, 'changed', arguments);
      // });
    } else {
      this._observer = new ObserveJS.ObjectObserver(this.model);
      // Object.observe(this.model, function(){
      //   console.log(name, 'changed', arguments);
      // })
    }

    this.changeDetected = this.changeDetected.bind(this);
    this._observer.open(this.changeDetected);
  },

  changeDetected: function(){
    this.render();
  },

  removeFromCollection: function(){
    if(this.collection){
      var index = this.collection.indexOf(this.model);
      if(index > -1){
        this.collection.splice(index, 1);
      }
    }
  },

  remove: function(){
    this._observer.close();
    this._observer = null;
    View.prototype.remove.apply(this);
  }
});

////////////////////
// Needs polling? //
////////////////////

// Does the client have both Object.observe and Array.observe?
var observeSupport = _.isFunction(Object.observe) && _.isFunction(Array.observe);

// If there is no support, activate polling
// see: https://github.com/polymer/observe-js#about-delivery-of-changes
if(!observeSupport){
  var pollForChanges = function(){
    /* global Platform */
    Platform.performMicrotaskCheckpoint();
  };

  var POLL_INTERVAL_TIMEOUT = 100;
  setInterval(pollForChanges, POLL_INTERVAL_TIMEOUT);

  window.addEventListener('click', pollForChanges);
  Backbone.on('sync', pollForChanges);
}
