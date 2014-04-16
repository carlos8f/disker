var crypto = require('crypto')
  , idgen = require('idgen')
  , meta = require('./meta')
  , es = require('event-stream')

Object.keys(crypto).forEach(function (k) {
  module.exports[k] = exports[k] = crypto[k];
});

exports.hash = function (data) {
  var sha = crypto.createHash('sha256').update(data);
  return idgen(sha.digest());
};

exports.hashStream = function () {
  var sha = crypto.createHash('sha256');
  return es.through(function write (data, encoding) {
    sha.update(data, encoding);
  }, function end () {
    this.emit('data', idgen(sha.digest()));
    this.emit('end');
  });
};

exports.hashObject = function (obj) {
  return exports.hash(meta.stringify(obj));
};
