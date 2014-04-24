var crypto = require('crypto')
  , idgen = require('idgen')
  , fs = require('graceful-fs')
  , path = require('path')
  , es = require('event-stream')
  , ursa = require('ursa')
  , toPEM = require('ssh-key-to-pem')
  , prompt = require('cli-prompt')
  , hash = require('../hash')

module.exports = function () {
  var keyring = this.keyring;

  function createKey (cb) {
    var debug = require('debug')('kafs:volume:crypto:createKey');
    try {
      var password = crypto.randomBytes(32);
    }
    catch (e) {
      return cb(e);
    }
    var key = {
      id: hash(password),
      password: password
    };

    initPublic(function (err) {
      if (err) return cb(err);
      var encrypted = keyring.publicKey.encrypt(password);
      key.sharable = key.id.substr(0, 16) + ':' + idgen(encrypted);
      key.sharable += ':' + hash(key.sharable).substr(0, 4);

      debug('writing', 'keys/' + key.id);
      keyring.write('keys/' + key.id, {hidden: true, lock: false}, function (err, stream) {
        if (err) return cb(err);

        stream.on('finish', function () {
          cb(null, key);
        });

        stream.write(encrypted);
        stream.end();
      });
    });
  }

  function initPublic (cb) {
    if (!keyring.publicKey) keyring.publicKey = ursa.createPublicKey(toPEM(keyring.pubkey));
    cb();
  }

  function initPrivate (cb) {
    var debug = require('debug')('kafs:volume:crypto:initPrivate');
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
  }

  function getKey (id, cb) {
    var debug = require('debug')('kafs:volume:crypto:getKey');
    initPrivate(function (err) {
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
          key.sharable += ':' + hash(key.sharable).substr(0, 4);
          debug('got key', key);
          cb(null, key);
        });
      });
    });
  }

  function sign (stat, cb) {
    var debug = require('debug')('kafs:volume:crypto:sign');
    initPrivate(function (err) {
      if (err) return cb(err);
      debug('sign stat', stat);
      var base = hash(stat);
      debug('sign base', base);
      var ret = keyring.privateKey.sign('sha256', base, 'base64');
      stat.signature = idgen(ret);
      debug('signature', stat);
      stat.fingerprint = keyring.fingerprint;
      cb();
    });
  }

  function verify (stat, cb) {
    var debug = require('debug')('kafs:volume:crypto:verify');
    if (!stat.hash) return cb(new Error('stat has no hash for verification'));
    if (!stat.fingerprint) return cb(new Error('stat has no fingerprint for verification'));
    debug('verify stat', stat);
    debug('hashObject', hash(stat));
    if (hash(stat) !== stat.hash) return cb(new Error('invalid hash'));
    if (stat.fingerprint === keyring.fingerprint) {
      initPublic(function (err) {
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

  return {
    createKey: createKey,
    getKey: getKey,
    sign: sign,
    verify: verify
  };
};
