var fs = require('graceful-fs')
  , es = require('event-stream')

Object.keys(fs).forEach(function (k) {
  module.exports[k] = exports[k] = fs[k];
});

exports.mkdirp = require('mkdirp');
exports.rimraf = require('rimraf');

// emulate core filesystem API
exports.emulate = function (volume) {
  return {
    writeFile: function (p, data, opts, cb) {
      if (typeof opts === 'function') {
        cb = opts;
        opts = {};
      }
      opts || (opts = {});
      volume.write(p, {gzip: true, cipher: volume.keyring && 'aes-256-cbc'}, function (err, stream) {
        if (err) return cb(err);
        stream.on('end', cb);
        stream.write(data, opts.encoding);
        stream.end();
      });
    },
    // read a buffer from file
    readFile: function (p, opts, cb) {
      if (typeof opts === 'function') {
        cb = opts;
        opts = {};
      }
      opts || (opts = {});
      volume.read(p, opts, function (err, stream) {
        if (err) return cb(err);
        var chunks = [];
        stream.on('data', function (data) {
          chunks.push(data);
        });
        stream.on('end', function () {
          var buf = (!opts.encoding || opts.encoding === 'buffer') ? Buffer.concat(chunks) : chunks.join('');
          cb(null, buf);
        });
      });
    },
    // stream to disk
    createWriteStream: function (p, opts) {
      var proxy = es.pause();
      proxy.pause();
      volume.write(p, opts, function (err, stream) {
        if (err) return proxy.emit('error', err);
        proxy.pipe(stream);
        proxy.resume();
      });
      return proxy;
    },
    // stream from disk
    createReadStream: function (p, opts) {
      opts || (opts = {});
      var proxy = es.through();
      volume.read(p, opts, function (err, stream) {
        if (err) return proxy.emit('error', err);
        stream.pipe(proxy);
      });
      return proxy;
    },
    exists: function (p, cb) {
      volume.stat(p, function (err, stat) {
        cb(!err);
      });
    },
    existsSync: function (p) {
      return fs.existsSync(volume.path(p));
    },
    stat: function (p, cb) {
      fs.stat(kafs.makePath(p), function (err, stat) {
        if (err) return cb(err);
        volume.stat(p, function (err, volstat) {
          if (err) return cb(err);
          stat.isFile = function () {
            return volstat.type === 'file';
          };
          stat.isDirectory = function () {
            return volstat.type === 'dir';
          };
          stat.size = volstat.size_raw;
          stat.atime = new Date();
          stat.ctime = new Date(volstat.updated);
          stat.mtime = new Date(volstat.updated);
          cb(null, stat);
        });
      });
    },
    unlink: function (p, cb) {
      volume.unlink(p, cb);
    },
    utimes: function (p, atime, mtime, cb) {
      // change file timestamps
    },
    rename: function (oldPath, newPath, cb) {
      
    },
    readdir: function (p, cb) {
      volume.readdir(p, cb);
    },
    watch: function (p, opts, cb) {

    },
    watchFile: function (p, opts, cb) {

    },
    unwatchFile: function (p, cb) {

    }
  };
};
