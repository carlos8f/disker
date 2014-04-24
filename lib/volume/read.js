var fs = require('graceful-fs')
  , crypto = require('crypto')
  , es = require('event-stream')
  , hash = require('../hash')
  , zlib = require('zlib')
  , strs = require('stringstream')

module.exports = function (p, opts, cb) {
  var volume = this;
  var debug = require('debug')('kafs:volume:read');
  debug('read', volume.id, p);
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }
  opts || (opts = {});
  volume.stat(p, function (err, stat) {
    if (err) return cb(err);
    var pipeline = [fs.createReadStream(volume.path(p))];

    function addDecipher (pipeline, cb) {
      if (!opts.raw && stat.cipher && (opts.password || (stat.key && volume.keyring))) {
        debug('reading encrypted', stat.cipher);
        if (opts.password) {
          debug('decrypting with password');
          pipeline.push(crypto.createDecipher(stat.cipher, opts.password));
          cb();
        }
        else {
          debug('decrypting with key', stat.key);
          volume.keyring.crypto.getKey(stat.key, function (err, key) {
            if (err) return cb(err);
            debug('got key to decrypt with', key);
            pipeline.push(crypto.createDecipher(stat.cipher, key.password));
            cb();
          });
        }
      }
      else cb();
    }

    addDecipher(pipeline, function () {
      if (!opts.raw && stat.gzip) pipeline.push(zlib.createGunzip());
      if (opts.encoding) pipeline.push(strs(opts.encoding));
      var stream = es.pipeline.apply(es, pipeline);
      if (opts.verify) {
        var mismatch = true;
        stream
          .pipe(hash.stream())
          .on('data', function (hash) {
            if (hash === stat.digest) mismatch = false;
          })
          .on('end', function () {
            if (mismatch) return cb(new Error('hash mismatch'));
            volume.keyring.crypto.verify(stat, function (err) {
              if (err) return cb(err);
              var pipeline = [fs.createReadStream(volume.path(p))];
              addDecipher(pipeline, function () {
                if (!opts.raw && stat.gzip) pipeline.push(zlib.createGunzip());
                if (opts.encoding) pipeline.push(strs(opts.encoding));
                cb(null, es.pipeline.apply(es, pipeline));
              });
            });
          })
      }
      else {
        debug('returning read stream', pipeline.length);
        cb(null, stream, stat);
      }
    });
  });
};
