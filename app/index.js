var jsondiffpatch = require('jsondiffpatch').create(),
    ObserverView  = require('./observer_view'),
    Backbone      = require('backbone'),
    _             = require('underscore');

var data = {
  a: 1,
  b: 1,
  c: {
    d: 1,
    e: [{f: 1}, {h: 1}]
  }
};

var copy = null;

var NormalView = ObserverView.extend({
  events: {
    'click button': function(){
      this.model.c.e.push({hero: true});
    }
  },
  template: _.template('<button><%- a %></button>')
});

var n = new NormalView(data);

document.body.appendChild(n.render().el);

var ItemView = ObserverView.extend({
  events: {
    'click .abc': 'removeFromCollection'
  },

  template: function(model) { return '<span class="abc">' + JSON.stringify(model) + '</span>'; }
});

var CollectionView = ObserverView.extend({
  ViewClass: ItemView,
  items: [],

  initialize: function(){
    ObserverView.prototype.initialize.apply(this, arguments);

    this.model.forEach(this.appendItem.bind(this));
  },

  appendItem: function(item){
    var itemView = new this.ViewClass(item);
    this.items.push(itemView);
    itemView.collection = this.model;
    this.$el.append(itemView.render().el);
  },

  removeItem: function(removedItem){
    var viewFromItem = _.find(this.items, function(item){
      return item.model === removedItem;
    });

    if(viewFromItem){
      this.items.splice(this.items.indexOf(viewFromItem), 1);
      viewFromItem.remove();
    }
  },

  changeDetected: function(splices){
    splices.forEach(this.interpretSlice.bind(this));
  },

  interpretSlice: function(slice){
    if(slice.addedCount){
      for(var i = 0; i < slice.addedCount; i++){
        var newItem = this.model[slice.index + i];
        this.appendItem(newItem);
      }
    }

    if(slice.removed.length > 0) {
      slice.removed.forEach(this.removeItem.bind(this));
    }
  },

  render: function(){
    return this;
  }
});

var a = new CollectionView(data.c.e);

document.body.appendChild(a.render().el);

// var OldView = Backbone.View.extend({
//   events: {
//     'click button': function(){ this.model.a++; this.model.c.e.push({f: 1}); this.render(); }
//   },
//   template: _.template("<button><%- a %></button><%_.forEach(c.e, function(element){ %><div><%- element.f %></div><%})%>"),
//   render: function(){
//     var html = this.template(this.model).trim();
//     this.$el.html(html);
//     return this;
//   }
// })

// var old = new OldView();
// old.model = data;
// document.body.appendChild(old.render().el);

_.defer(function(){
  copy = JSON.parse(JSON.stringify(data));
  copy.a = '3';
  copy.c.d = '3';
  copy.c.e = [{f: 1}, {aintitcool: 1}, {g: 1}, {h: 1}, {fabulous: 1}];
  copy.c.e[3].h = 2;
  var diff = jsondiffpatch.diff(data, copy);
  jsondiffpatch.patch(data, diff);
  Backbone.trigger('sync');
});
