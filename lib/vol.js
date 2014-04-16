var fs = require('graceful-fs')
  , path = require('path')

module.exports = {
  init: require('./init'),
  read: function (p, opts, cb) {
    if (typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    opts || (opts = {});

    try {
      var manifest = require(path.join(p, 'kafs.json'));
    }
    catch (e) {
      return cb(e);
    }
    cb(null, manifest);
  }
};
