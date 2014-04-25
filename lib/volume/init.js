var fs = require('graceful-fs')
  , path = require('path')
  , meta = require('../meta')
  , keygen = require('ssh-keygen2')
  , idgen = require('idgen')
  , version = require('../../package.json').version
  , load = require('./load')
  , mkdirp = require('mkdirp')

module.exports = function (p, opts, cb) {
  var debug = require('debug')('kafs:volume:init');
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }
  opts || (opts = {});
  opts.depth = typeof opts.depth === 'number' ? opts.depth : 3;
  opts.mode = typeof opts.mode === 'number' ? opts.mode : 0700;
  debug('init', opts);

  var id = idgen();

  fs.exists(path.join(p, 'kafs.json'), function (exists) {
    if (exists) return cb(new Error('cannot init: path already exists'));
    debug('p does not exist', p);
    mkdirp(p, opts.mode, function (err) {
      if (err) return cb(err);
      debug('made dir');

      var manifest = {
        id: id,
        kafs: version,
        created: new Date().getTime(),
        depth: opts.depth
      };

      if (opts.keypair) writeKeys();
      else writeManifest();

      function writeManifest () {
        meta.write(path.join(p, 'kafs'), manifest, function (err) {
          if (err) return cb(err);
          load(p, cb);
        });
      }

      function writeKeys () {
        manifest.passphrase = !!opts.passphrase;
        keygen({
          bits: opts.bits,
          location: path.join(p, 'key'),
          password: opts.passphrase,
          comment: 'kafs:' + id,
          keep: true
        }, function (err, keypair) {
          if (err) return cb(err);
          debug('key', keypair);
          manifest.pubkey = keypair.public.replace(/\s*$/, '');
          manifest.fingerprint = keypair.fingerprint;
          writeManifest();
        });
      }
    });
  });
};
