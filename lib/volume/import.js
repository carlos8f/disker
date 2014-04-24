var fs = require('graceful-fs')
  , path = require('path')
  , minimatch = require('minimatch')
  , rreaddir = require('rreaddir')

module.exports = function (p, opts, cb) {
  var volume = this;
  var debug = require('debug')('kafs:volume:import');
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }
  opts || (opts = {});
  if (typeof opts.include === 'string') opts.include = opts.include.split(',');
  if (typeof opts.exclude === 'string') opts.exclude = opts.exclude.split(',');

  function shouldImport (file) {
    if (!file.stat.isFile()) return false;
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

  rreaddir(p, {fs: fs}, function (err, files) {
    if (err) return cb(err);
    var latch = 0, errored = false;
    function onErr (err) {
      if (errored) return;
      errored = true;
      cb(err);
    }
    files.forEach(function (file) {
      if (!shouldImport(file)) return;
      latch++;
      var relpath = path.relative(p, file.path);
      fs.createReadStream(file.path)
        .on('error', onErr)
        .pipe(volume.fs.createWriteStream(relpath))
        .on('error', onErr)
        .on('finish', function () {
          if (!--latch) cb();
        });
    });

    if (!latch) return cb();
  });
};
