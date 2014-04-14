var fs = require('graceful-fs')
  , mkdirp = require('mkdirp')
  , crypto = require('crypto')
  , path = require('path')
  , zlib = require('zlib')
  , es = require('event-stream')
  , rimraf = require('rimraf')
  , idgen = require('idgen')

module.exports = function kafs (options) {
  options || (options = {});
  if (typeof options.mode === 'undefined') options.mode = 0600;
  if (typeof options.dirMode === 'undefined') options.dirMode = 0700;
  if (typeof options.depth === 'undefined') options.depth = 3;
  if (typeof options.gzip === 'undefined' && options.gunzip === 'undefined') options.gzip = options.gunzip = true;
  if (!options.volume) options.volume = 'default';

  var kafs = {
    // option cascading
    augmentOpts: function (opts) {
      var merged = {};
      Object.keys(opts || {}).forEach(function (k) {
        merged[k] = opts[k];
      });
      Object.keys(options).forEach(function (k) {
        if (typeof merged[k] === 'undefined') merged[k] = options[k];
      });
      // gzip/gunzip by default
      if (typeof merged.gzip === 'undefined' && merged.gunzip === 'undefined') {
        merged.gzip = true;
        merged.gunzip = true;
      }
      return merged;
    },
    // the hash function used to partition data
    hash: function (k, opts) {
      opts = kafs.augmentOpts(opts);
      return crypto.createHash('sha1')
        .update(opts.insensitive ? k.toLowerCase() : k)
        .digest('hex');
    },
    // translate a virtual file path into a physical one
    makePath: function (p, opts) {
      opts = kafs.augmentOpts(opts);
      p = path.resolve(path.sep, p);
      if (opts.rawPath) return p;
      var hash = kafs.hash(p, opts);
      var parts = [];
      for (var idx = 0; idx < opts.depth; idx++) {
        parts.push(hash.charAt(idx));
      }
      parts.push(hash.substr(opts.depth));
      return path.resolve(opts.datadir, opts.volume, path.join.apply(path, parts));
    },
    init: function (opts, cb) {
      if (typeof opts === 'function') {
        cb = opts;
        opts = {};
      }
      opts = kafs.augmentOpts(opts);
      var dest = path.join(opts.datadir, opts.volume);
      mkdirp(dest, opts.dirMode, function (err) {
        if (err) return cb(err);
        var confPath = path.join(dest, 'kafs.json');
        fs.exists(confPath, function (exists) {
          if (exists) return cb(new Error('volume already exists at ' + opts.volume + '. use `kafs destroy` to start over.'));
          var optsCopy = {};
          if (opts.writeKey) opts.key = idgen();
          Object.keys(opts).forEach(function (k) {
            if (k.match(/^(password|writeKey|datadir|keydir|_.*)$/) || opts[k] instanceof Object) return;
            optsCopy[k] = opts[k];
          });
          if (!opts.writeKey) return writeConf();
          var keyDest = path.join(opts.keydir, opts.key);
          mkdirp(path.dirname(keyDest), opts.dirMode, function (err) {
            if (err) return cb(err);
            fs.exists(keyDest, function (exists) {
              if (exists) return cb(new Error('key file already exists at ' + opts.key + '. please do not re-use keys.'));
              fs.writeFile(keyDest, opts.password, {mode: 0600}, function (err) {
                if (err) return cb(err);
                writeConf();
              });
            });
          });

          function writeConf () {
            fs.writeFile(confPath, JSON.stringify(optsCopy, null, 2), {code: opts.mode}, function (err) {
              if (err) return cb(err);
              cb();
            });
          }
        });
      });
    },
    // create a file, returning an error if the path already exists
    createFile: function (p, data, opts, cb) {
      kafs.exists(p, function (exists) {
        if (exists) return cb(new Error('file already exists'));
        kafs.writeFile(p, data, opts, cb);
      });
    },
    // write a buffer to file
    writeFile: function (p, data, opts, cb) {
      if (typeof opts === 'function') {
        cb = opts;
        opts = {};
      }
      opts = kafs.augmentOpts(opts);
      if (kafs.makePath(p, opts) === path.sep) return cb(new Error('root path not alterable'));

      if (opts.gzip) {
        zlib.gzip(data, function (err, data) {
          if (err) return cb(err);
          possiblyCipher(data);
        });
      }
      else possiblyCipher(data);

      function possiblyCipher (data) {
        if (opts.cipher) {
          var cipher = crypto.createCipher(opts.cipher, opts.password);
          var chunks = [];
          cipher.on('data', function (chunk) {
            chunks.push(chunk);
          });
          cipher.on('end', function () {
            writeFile(Buffer.concat(chunks));
          });
          cipher.on('error', cb);
          cipher.write(data);
          cipher.end();
        }
        else writeFile(data);
      }
      function writeFile (data) {
        var dest = kafs.makePath(p, opts);
        var dir = path.dirname(dest);
        mkdirp(dir, opts.dirMode, function (err) {
          if (err) return cb(err);
          fs.writeFile(dest, data, {mode: opts.mode}, cb);
        });
      }
    },
    // read a buffer from file
    readFile: function (p, opts, cb) {
      if (typeof opts === 'function') {
        cb = opts;
        opts = {};
      }
      opts = kafs.augmentOpts(opts);
      fs.readFile(kafs.makePath(p, opts), function (err, data) {
        if (err) return cb(err);
        if (opts.cipher) {
          var decipher = crypto.createDecipher(opts.cipher, opts.password);
          var chunks = [];
          decipher.on('data', function (chunk) {
            chunks.push(chunk);
          });
          decipher.on('end', function () {
            possiblyGunzip(Buffer.concat(chunks));
          });
          decipher.on('error', cb);
          decipher.write(data);
          decipher.end();
        }
        else possiblyGunzip(data);

        function possiblyGunzip (data) {
          if (opts.gunzip) {
            zlib.gunzip(data, function (err, data) {
              if (err) return cb(err);
              if (opts.encoding) data = data.toString(opts.encoding);
              cb(null, data);
            });
          }
          else {
            if (opts.encoding) data = data.toString(opts.encoding);
            cb(null, data);
          }
        }
      });
    },
    // stream to disk
    createWriteStream: function (p, opts) {
      opts = kafs.augmentOpts(opts || {});
      if (kafs.makePath(p, opts) === path.sep) throw new Error('root path not alterable');

      var dest = kafs.makePath(p, opts);
      var dir = path.dirname(dest);
      mkdirp.sync(dir, opts.dirMode);

      var pipeline = [];
      if (opts.gzip) {
        pipeline.push(zlib.createGzip());
      }
      if (opts.cipher) {
        pipeline.push(crypto.createCipher(opts.cipher, opts.password));
      }
      pipeline.push(fs.createWriteStream(dest, {mode: opts.mode}));
      return es.pipeline.apply(es, pipeline);
    },
    // stream from disk
    createReadStream: function (p, opts) {
      opts = kafs.augmentOpts(opts || {});

      var src = kafs.makePath(p, opts);
      var pipeline = [fs.createReadStream(src)];
      if (opts.cipher) {
        pipeline.push(crypto.createDecipher(opts.cipher, opts.password));
      }
      if (opts.gunzip || (opts.gzip && typeof opts.gunzip === 'undefined')) {
        pipeline.push(zlib.createGunzip());
      }
      var stream = es.pipeline.apply(es, pipeline);
      if (opts.encoding) stream.setEncoding(opts.encoding);
      return stream;
    },
    exists: function (p, cb) {
      return fs.exists(kafs.makePath(p), cb);
    },
    existsSync: function (p) {
      return fs.existsSync(kafs.makePath(p));
    },
    stat: function (p, cb) {
      return fs.stat(kafs.makePath(p), cb);
    },
    statSync: function (p) {
      return fs.statSync(kafs.makePath(p));
    },
    link: function (srcpath, dstpath, cb) {
      return fs.link(kafs.makePath(srcpath), kafs.makePath(dstpath));
    },
    linkSync: function (srcpath, dstpath) {
      return fs.linkSync(kafs.makePath(srcpath), kafs.makePath(dstpath));
    },
    symlink: function (srcpath, dstpath, type, cb) {
      return fs.symlink(kafs.makePath(srcpath), kafs.makePath(dstpath), type, cb);
    },
    symlinkSync: function (srcpath, dstpath, type) {
      return fs.symlinkSync(kafs.makePath(srcpath), kafs.makePath(dstpath), type);
    },
    readlink: function (p, cb) {
      return fs.readLink(kafs.makePath(p), cb);
    },
    readlinkSync: function (p) {
      return fs.readLinkSync(kafs.makePath(p));
    },
    unlink: function (p, cb) {
      return fs.unlink(kafs.makePath(p), cb);
    },
    unlinkSync: function (p) {
      return fs.unlinkSync(kafs.makePath(p));
    },
    utimes: function (p, atime, mtime, cb) {
      return fs.utimes(kafs.makePath(p), atime, mtime, cb);
    },
    utimesSync: function (p, atime, mtime) {
      return fs.utimesSync(kafs.makePath(p), atime, mtime);
    },
    rename: function (oldPath, newPath, cb) {
      fs.rename(kafs.makePath(oldPath), kafs.makePath(newPath), cb);
    },
    renameSync: function (oldPath, newPath) {
      fs.renameSync(kafs.makePath(oldPath), kafs.makePath(newPath));
    },
    readdir: function (p, cb) {
      // @todo, requires meta storage
    },
    import: function (dir, cb) {
      // recurse over a dir and add all files to the store
    },
    export: function (dest, cb) {
      // export the store's contents to the filesystem
      // requires meta storage to get original paths
    },
    destroy: function (cb) {
      // rimraf all the files
      rimraf(path.join(options.datadir, options.volume), cb);
    }
  };

  return kafs;
};
