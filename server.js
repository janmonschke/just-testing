var sttc = require('node-static');
var fileServer = new sttc.Server('./public');

var app = require('http').createServer(function (request, response) {
  request.addListener('end', function () {
    fileServer.serve(request, response);
  }).resume();
});

var io = require('socket.io')(app);
io.on('connection', function (socket) {
  console.log('new socket');

  socket.on('join', function (room, notify) {
    console.log('joining', room);
    socket.join(room);
    notify();
  });

  socket.on('ack', function(data){
    console.log('received an ack from room', data.room);
    console.log('clients in this room', io.to(data.room).sockets.length)
  });
});

app.listen(9000);
