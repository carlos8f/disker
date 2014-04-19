var path = require('path')
  , crypto = require('./crypto')

Object.keys(path).forEach(function (k) {
  module.exports[k] = exports[k] = path[k];
});

// get the hashed path for a virtual path, relative to volume dir.
exports.hash = function (p, depth) {
  p = path.resolve(path.sep, p);
  // hex encoding works with case-insensitive filesystems.
  var hash = crypto.hash(p, 'hex');
  var parts = [];
  for (var idx = 0; idx < depth; idx++) {
    parts.push(hash.charAt(idx));
  }
  parts.push(hash.substr(depth));
  return path.join.apply(path, parts);
};

exports.sep = '/';
