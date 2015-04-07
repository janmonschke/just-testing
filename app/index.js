var jsondiffpatch = require('jsondiffpatch').create();
var ObserveJS = require('observe-js');
var _ = require('underscore');

var data = {
  a: 1,
  b: 1,
  c: {
    d: 1,
    e: [{f: 1}, {g: 1}]
  }
};

var copy = null;

var ObserverView = function(name, data){
  this.name = name;
  if (_.isArray(data)) {
    this._observer = new ObserveJS.ArrayObserver(data);
    // Array.observe(data, function(){
    //   console.log(name, 'changed', arguments);
    // });
  } else {
    this._observer = new ObserveJS.ObjectObserver(data);
    // Object.observe(data, function(){
    //   console.log(name, 'changed', arguments);
    // })
  }

  this._observer.open(function(){
    console.log(name, 'changed', arguments);
  })
};

var a = new ObserverView('n1', data);
var c = new ObserverView('n2', data.c);
var d = new ObserverView('n3', data.c.e);

_.defer(function(){
  copy = JSON.parse(JSON.stringify(data));
  copy.a = '3';
  copy.c.d = '3';
  copy.c.e.push({awesome: true});
  copy.c.e.push({awesome: true});
  var diff = jsondiffpatch.diff(data, copy);
  jsondiffpatch.patch(data, diff);
  console.log('three changes');
});
