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
  var copy = {};
  // leave out hash and signature from all hashes
  Object.keys(obj).forEach(function (k) {
    if (!k.match(/^(hash|signature|fingerprint)$/)) copy[k] = obj[k];
  });
  return exports.hash(meta.stringify(copy));
};

// given a volume, mix in crypto functions
exports.keyring = function (keyring) {
  var funcs = {
    hash: exports.hash,
    hashStream: exports.hashStream,
    hashObject: exports.hashObject,
    createKey: function (cb) {
      try {
        var password = crypto.randomBytes(32);
      }
      catch (e) {
        return cb(e);
      }
      var key = {
        id: funcs.hash(password),
        password: password
      };

      funcs.initPublic(function (err) {
        if (err) return cb(err);
        var encrypted = keyring.publicKey.encrypt(password);
        key.sharable = key.id.substr(0, 16) + ':' + idgen(encrypted);
        key.sharable += ':' + funcs.hash(key.sharable).substr(0, 4);

        debug('writing', 'keys/' + key.id);
        keyring.write('keys/' + key.id, {hidden: true}, function (err, stream) {
          if (err) return cb(err);

          stream.on('end', function () {
            cb(null, key);
          });

          stream.write(encrypted);
          stream.end();
        });
      });
    },
    initPublic: function (cb) {
      if (!keyring.publicKey) keyring.publicKey = ursa.createPublicKey(toPEM(keyring.pubkey));
      cb();
    },
    initPrivate: function (cb) {
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
            cb();
          });
        }
      }
      else cb();
    },
    getKey: function (id, cb) {
      funcs.initPrivate(function (err) {
        if (err) return cb(err);
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
            key.sharable += ':' + funcs.hash(key.sharable).substr(0, 4);
            debug('got key', key);
            cb(null, key);
          });
        });
      });
    },
    sign: function (stat, cb) {
      var debug = require('debug')('kafs:crypto:sign');
      funcs.initPrivate(function (err) {
        if (err) return cb(err);
        debug('sign stat', stat);
        var base = funcs.hashObject(stat);
        debug('sign base', base);
        var ret = keyring.privateKey.sign('sha256', base, 'base64');
        stat.signature = idgen(ret);
        debug('signature', stat);
        stat.fingerprint = keyring.fingerprint;
        cb();
      });
    },
    verify: function (stat, cb) {
      var debug = require('debug')('kafs:crypto:verify');
      if (!stat.hash) return cb(new Error('stat has no hash for verification'));
      if (!stat.fingerprint) return cb(new Error('stat has no fingerprint for verification'));
      debug('verify stat', stat);
      debug('hashObject', funcs.hashObject(stat));
      if (funcs.hashObject(stat) !== stat.hash) return cb(new Error('invalid hash'));
      if (stat.fingerprint === keyring.fingerprint) {
        funcs.initPublic(function (err) {
          if (err) return cb(err);
          withPublicKey(keyring.publicKey);
        });
      }
      else {
        keyring.read('fingerprints/' + stat.fingerprint, function (err, stream, stat) {
          if (err && err.code === 'ENOENT') {
            return cb(new Error('could not verify: fingerprint not on file'));
          }
          if (err) return cb(err);
          var chunks = [];
          stream.on('data', function (data) {
            chunks.push(data);
          });
          stream.on('end', function () {
            withPublicKey(ursa.createPublicKey(Buffer.concat(chunks).toString('ascii')));
          });
        });
      }

      function withPublicKey (publicKey) {
        if (!publicKey.verify('sha256', Buffer(stat.hash, 'base64'), Buffer(stat.signature, 'base64'))) {
          var err = new Error('invalid signature');
          err.stat = stat;
          err.code = 'EINVALID';
          return cb(err);
        }
        cb();
      }
    }
  };

  Object.keys(funcs).forEach(function (k) {
    keyring[k] = funcs[k];
  });
};
