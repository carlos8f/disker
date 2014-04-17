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

// generate random aes keys
// encrypt/decrypt stuff
// generate copy-paste-friendly representation of a key:
// key id = sha256(key)
// key format: (key id, truncated to 16 chars, base64):(rsa encrypted key, base64):(optional, 4-digit minimum sha256 of key id + encrypted key, for error checking)
