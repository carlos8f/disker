var path = require('path')
  , crypto = require('./crypto')

Object.keys(path).forEach(function (k) {
  module.exports[k] = exports[k] = path[k];
});

// get the hashed path for a virtual path, relative to volume dir.
exports.hash = function (p, depth) {
  p = path.resolve(path.sep, p);
  var hash = crypto.hash(p, opts);
  var parts = [];
  for (var idx = 0; idx < opts.depth; idx++) {
    parts.push(hash.charAt(idx));
  }
  parts.push(hash.substr(opts.depth));
  return path.join(parts);
};

exports.sep = '/';
