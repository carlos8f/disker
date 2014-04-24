var crypto = require('crypto')
  , idgen = require('idgen')
  , meta = require('./meta')
  , es = require('event-stream')

var hash = module.exports = function (data, outEncoding) {
  if (data.constructor === Object) return hashObject(data, outEncoding);
  var sha = crypto.createHash('sha256').update(data);
  return outEncoding ? sha.digest(outEncoding) : idgen(sha.digest());
};

hash.stream = function () {
  var sha = crypto.createHash('sha256');
  return es.through(function write (data, encoding) {
    sha.update(data, encoding);
  }, function end () {
    this.emit('data', idgen(sha.digest()));
    this.emit('end');
  });
};

function hashObject (obj, outEncoding) {
  var copy = {};
  // leave out hash and signature from all hashes
  Object.keys(obj).forEach(function (k) {
    if (!k.match(/^(hash|signature|fingerprint)$/)) copy[k] = obj[k];
  });
  return hash(meta.stringify(copy), outEncoding);
};
