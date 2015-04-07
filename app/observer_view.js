var ObserveJS = require('observe-js'),
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
