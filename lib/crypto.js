var crypto = require('crypto')
  , idgen = require('idgen')
  , meta = require('./meta')
  , fs = require('./fs')
  , path = require('./path')
  , es = require('event-stream')
  , ursa = require('ursa')
  , toPEM = require('ssh-key-to-pem')
  , prompt = require('cli-prompt')
  , debug = require('debug')('kafs:crypto')

Object.keys(crypto).forEach(function (k) {
  module.exports[k] = exports[k] = crypto[k];
});

exports.hash = function (data, outEncoding) {
  var sha = crypto.createHash('sha256').update(data);
  return outEncoding ? sha.digest(outEncoding) : idgen(sha.digest());
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

  if (!keyring.publicKey) {
    keyring.publicKey = ursa.createPublicKey(toPEM(keyring.pubkey));
  }
  var encrypted = keyring.publicKey.encrypt(password);
  key.sharable = key.id.substr(0, 16) + ':' + idgen(encrypted);
  key.sharable += ':' + exports.hash(key.sharable).substr(0, 4);

  debug('writing', 'keys/' + key.id);
  keyring.write('keys/' + key.id, function (err, stream) {
    if (err) return cb(err);

    stream.on('end', function () {
      cb(null, key);
    });

    stream.write(encrypted);
    stream.end();
  });
};

exports.getKey = function (keyring, id, cb) {
  if (!keyring.privateKey) {
    if (keyring.password) {
      prompt.password('Enter password: ', withPassword);
    }
    else withPassword(undefined);

    function withPassword (password) {
      fs.readFile(path.join(keyring.path(), 'key'), {encoding: 'ascii'}, function (err, pem) {
        if (err) return cb(err);
        debug('pem', pem);
        keyring.privateKey = ursa.createPrivateKey(pem, password);
        withPrivateKey();
      });
    }
  }
  else withPrivateKey();

  function withPrivateKey () {
    debug('reading', 'keys/' + id);
    keyring.read('keys/' + id, function (err, stream) {
      debug('got key read stream', err);
      if (err) return cb(err);
      var chunks = [];
      stream.on('data', function (data) {
        chunks.push(data);
      });
      stream.on('end', function () {
        debug('key read stream end');
        var encrypted = Buffer.concat(chunks);
        var key = {
          id: id,
          password: keyring.privateKey.decrypt(encrypted),
          sharable: id.substr(0, 16) + ':' + idgen(encrypted)
        };
        key.sharable += ':' + exports.hash(key.sharable).substr(0, 4);
        debug('got key', key);
        cb(null, key);
      });
    });
  }
};
