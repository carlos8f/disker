var crypto = require('crypto')
  , idgen = require('idgen')
  , es = require('event-stream')

module.exports = {
  hash: function (data) {
    var sha = crypto.createHash('sha256').update(data).digest();
    return idgen(sha);
  },
  hashStream: function () {
    var sha = crypto.createHash('sha256');
    return es.through(function write (data, encoding) {
      sha.update(data, encoding);
    }, function end () {
      this.emit('data', idgen(sha.digest()));
      this.emit('end');
    });
  }
};
