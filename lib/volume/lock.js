var lockfile = require('lockfile')
  , path = require('path')
  , mkdirp = require('mkdirp')

module.exports = function (p, cb) {
  var volume = this;
  var debug = require('debug')('kafs:volume:lock');
  var opts = {
    wait: 10000,
    stale: 30000,
    retries: 10,
    retryWait: 2000
  };
  var lockpath = path.join(volume.volPath, volume.path(p) + '.lock');
  debug('locking...', lockpath);
  mkdirp(path.dirname(lockpath), function (err) {
    if (err) return cb(err);
    lockfile.lock(lockpath, opts, function (err) {
      debug('locked', err);
      cb(err);
    });
  });
};
