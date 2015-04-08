module.exports = {
  randomID: function(prefix) {
    var id = prefix ? prefix + '_' : '';
    return id + (Math.random() * Date.now() * Math.random() * 999999);
  }
};
