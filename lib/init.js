var keygen = require('ssh-keygen')
  , fs = require('graceful-fs')
  , mkdirp = require('mkdirp')
  , path = require('path')
  , stringify = require('json-stable-stringify')
  , debug = require('debug')('kafs:init')
  , idgen = require('idgen')

module.exports = function (p, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }
  opts || (opts = {});
  opts.depth = typeof opts.depth === 'number' ? opts.depth : 3;
  opts.mode = typeof opts.mode === 'number' ? opts.mode : 0700;
  debug('init', opts);

  var id = idgen();

  fs.exists(p, function (exists) {
    if (exists) return cb(new Error('cannot init: path already exists'));
    debug('p does not exist', p);
    mkdirp(p, opts.mode, function (err) {
      if (err) return cb(err);
      debug('made dir');
      keygen({
        bits: opts.bits,
        location: path.join(p, 'key'),
        password: opts.password,
        comment: opts.comment || 'kafs:' + id
      }, function (err, key) {
        if (err) return cb(err);
        debug('key', key);
        keygen({
          location: path.join(p, 'key'),
          fingerprint: true
        }, function (err, fingerprint) {
          if (err) return cb(err);
          debug('fingerprint', fingerprint);
          var manifest = {
            id: id,
            created: new Date().getTime(),
            clock: 0,
            pubkey: key.pubKey.replace(/\s*$/, ''),
            fingerprint: fingerprint.trim(),
            depth: opts.depth
          };
          var manifestJSON = stringify(manifest, {space: '  '});
          debug('manifest', manifestJSON);
          fs.writeFile(path.join(p, 'kafs.json'), manifestJSON, function (err) {
            if (err) return cb(err);
            debug('done');
            cb(null, manifest);
          });
        });
      });
    });
  });
};
