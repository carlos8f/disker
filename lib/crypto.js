var crypto = require('crypto')
  , idgen = require('idgen')
  , meta = require('./meta')
  , es = require('event-stream')
  , ursa = require('ursa')
  , toPEM = require('ssh-key-to-pem')

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

exports.createKey = function (keyring, cb) {
  try {
    var password = crypto.randomBytes(32);
  }
  catch (e) {
    return cb(e);
  }
  var key = {
    id: exports.hash(password),
    password: password
  };

  var pubkey = ursa.createPublicKey(toPEM(keyring.pubkey));
  var encrypted = pubkey.encrypt(password);
  key.sharable = key.id.substr(0, 16) + ':' + idgen(encrypted);
  key.sharable += ':' + exports.hash(key.sharable).substr(0, 4);

  keyring.write('keys/' + id, {cipher: 'rsa'}, function (err, stream) {
    if (err) return cb(err);

    stream.on('end', function () {
      cb(null, key);
    });

    stream.write(encrypted);
    stream.end();
  });
};

// generate random aes keys
// encrypt/decrypt stuff
// generate copy-paste-friendly representation of a key:
// key id = sha256(key)
// key format: (key id, truncated to 16 chars, base64):(rsa encrypted key, base64):(optional, 4-digit minimum sha256 of key id + encrypted key, for error checking)
