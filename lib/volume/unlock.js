var lockfile = require('lockfile')
  , path = require('path')

module.exports = function (message, cb) {
  if (typeof message === 'function') {
    cb = message;
    message = '';
  }
  var volume = this;
  var debug = require('debug')('kafs:volume:lock');
  debug('unlocking...', message);
  lockfile.unlock(path.join(volume.volPath, 'lock'), function (err) {
    debug('unlocked', message, err);
    cb(err);
  });
};
