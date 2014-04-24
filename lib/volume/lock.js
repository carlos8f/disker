var lockfile = require('lockfile')
  , path = require('path')

module.exports = function (message, cb) {
  if (typeof message === 'function') {
    cb = message;
    message = '';
  }
  var volume = this;
  var debug = require('debug')('kafs:volume:lock');
  var opts = {
    wait: 10000,
    stale: 30000,
    retries: 10,
    retryWait: 2000
  };
  debug('locking...', message);
  lockfile.lock(path.join(volume.volPath, 'lock'), opts, function (err) {
    debug('locked', message, err);
    cb(err);
  });
};
