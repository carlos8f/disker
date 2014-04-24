var fs = require('graceful-fs')
  , mkdirp = require('mkdirp')
  , minimatch = require('minimatch')
  , path = require('path')

module.exports = function (p, opts, cb) {
  var volume = this;
  var debug = require('debug')('kafs:volume:export');
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }
  opts || (opts = {});
  if (typeof opts.include === 'string') opts.include = opts.include.split(',');
  if (typeof opts.exclude === 'string') opts.exclude = opts.exclude.split(',');
  debug('export', p, opts);

  function shouldExport (file) {
    var ret = true;
    if (opts.include) {
      ret = opts.include.some(function (pattern) {
        return minimatch(file.path, pattern);
      });
    }
    if (opts.exclude) {
      ret = ret && !opts.exclude.some(function (pattern) {
        return minimatch(file.path, pattern);
      });
    }
    return ret;
  }

  volume.readdir('/', {recursive: true, stat: true}, function (err, files) {
    if (err) return cb(err);
    var latch = 0, errored = false;
    function onErr (err) {
      if (errored) return;
      errored = true;
      cb(err);
    }

    files.forEach(function (file) {
      if (!shouldExport(file)) return;
      var dir = path.join(p, path.relative('/', file.path));
      var dest;
      if (file.stat.isFile()) {
        dest = path.join(p, path.relative('/', file.path));
        dir = path.dirname(dest);
        debug('export file', dest);
      }
      else if (file.stat.isDirectory()) {
        debug('export dir', dir);
      }

      latch++;
      debug('mkdirp', dir);
      mkdirp(dir, function (err) {
        if (err) return onErr(err);
        if (dest) {
          volume.fs.createReadStream(file.path)
            .pipe(fs.createWriteStream(dest))
            .on('error', onErr)
            .on('finish', function () {
              if (!--latch) cb();
            });
        }
        else if (!--latch) cb();
      });
    });

    if (!latch) return cb();
  });
};
