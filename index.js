var fs = require('graceful-fs')
  , mkdirp = require('mkdirp')
  , crypto = require('crypto')
  , path = require('path')
  , zlib = require('zlib')
  , es = require('event-stream')

module.exports = function disker (options) {
  options || (options = {});

  options.root = options.root || '.';

  if (typeof options.depth === 'undefined') options.depth = 3;
  options.depth || (options.depth = 0);

  var disker = {
    hash: function (k) {
      return crypto.createHash('sha1')
        .update(options.insensitive ? k.toLowerCase() : k)
        .digest('hex');
    },
    makePath: function (k) {
      var hash = disker.hash(k);
      var p = [];
      for (var idx = 0; idx < options.depth; idx++) {
        p.push(hash.charAt(idx));
      }
      p.push(hash.substr(options.depth));
      return path.join.apply(path, p);
    },
    writeFile: function (p, data, options, cb) {

    },
    readFile: function (p, options, cb) {

    },
    createWriteStream: function (p, opts) {
      var pipeline = [es.through()];
      if (options.gzip) pipeline.push(zlib.createGzip());
      if (options.cipher) pipeline.push(crypto.createCipher(options.cipher, options.password));
      return es.pipeline.apply(es, pipeline);
    },
    createReadStream: function (p, opts) {

    },
    exists: function (p, cb) {

    },
    unlink: function (p, cb) {

    },
    stat: function (p, cb) {

    },
    rename: function (p, cb) {

    },
    readdir: function (p, cb) {

    },
    import: function (dir, cb) {
      // recurse over a dir and add all files to the store
    },
    export: function (dest, cb) {
      // export the store's contents to the filesystem
    }
  };

  return disker;
};
