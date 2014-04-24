var path = require('path')
  , hash = require('../hash')

module.exports = function (p) {
  if (p) {
    p = path.resolve('/', p);
    // hex encoding works with case-insensitive filesystems.
    var str = hash(p, 'hex');
    var parts = [this.volPath];
    for (var idx = 0; idx < this.depth; idx++) {
      parts.push(str.charAt(idx));
    }
    parts.push(str.substr(this.depth));
    return path.join.apply(path, parts);
  }

  return this.volPath;
};
