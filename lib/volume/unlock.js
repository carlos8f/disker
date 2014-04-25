var lockfile = require('lockfile')
  , path = require('path')

module.exports = function (p, message, cb) {
  if (typeof message === 'function') {
    cb = message;
    message = '';
  }
  var volume = this;
  var debug = require('debug')('kafs:volume:lock');
  var lockpath = path.join(volume.volPath, volume.path(p) + '.lock');
  debug('unlocking...', lockpath, message);
  lockfile.unlock(lockpath, function (err) {
    debug('unlocked', message, err);
    cb(err);
  });
};
