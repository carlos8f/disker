var fs = require('graceful-fs')
  , path = require('path')
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

  mkdirp(p, opts.mode, function (err) {
    if (err) return cb(err);
    var meta = require('./meta').call({volPath: p});
    meta.read('KAFS', function (err, volume) {
      if (err) return cb(err);
      if (volume) return cb(new Error('volume already exists'));

      volume = meta.create({
        kafs: version,
        depth: opts.depth
      });

      if (opts.keypair) writeKeys();
      else writeVolume();

      function writeVolume () {
        meta.write('KAFS', volume, function (err) {
          if (err) return cb(err);
          load(p, cb);
        });
      }

      function writeKeys () {
        volume.passphrase = !!opts.passphrase;
        keygen({
          bits: opts.bits,
          location: path.join(p, 'key'),
          password: opts.passphrase,
          comment: 'kafs:' + id,
          keep: true
        }, function (err, keypair) {
          if (err) return cb(err);
          debug('key', keypair);
          volume.pubkey = keypair.public.replace(/\s*$/, '');
          volume.fingerprint = keypair.fingerprint;
          writeVolume();
        });
      }
    });
  });
};
