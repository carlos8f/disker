var fs = require('graceful-fs');

module.exports = function (p, opts, cb) {
  var volume = this;
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }
  opts || (opts = {});
  var debug = require('debug')('kafs:volume:unlink');
  volume.lock(function (err) {
    if (err) return cb(err);
    volume.stat(p, function (err, stat) {
      if (err) return cb(err);
      debug('removing', volume.path(p) + '.json');
      fs.unlink(volume.path(p) + '.json', function (err) {
        if (err) return cb(err);
        debug('removing', volume.path(p));
        fs.unlink(volume.path(p), function (err) {
          if (err) return cb(err);
          volume.journal('-', p, {emit: opts.emit}, function (err) {
            if (err) return cb(err);
            volume.unlock(function (err) {
              if (err) return cb(err);
              if (opts.emit !== false) volume.emit('-', stat);
              cb();
            });
          });
        });
      });
    });
  });
};
