var es = require('event-stream')
  , rreaddir = require('rreaddir')

module.exports = function (p, opts, cb) {
  var volume = this;
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }
  opts || (opts = {});
  var debug = require('debug')('kafs:volume:readdir');
  debug('readdir', p, opts);
  if (opts.recursive) {
    opts.fs = volume.fs;
    return rreaddir(p, opts, cb);
  }
  volume.read(p, function (err, stream) {
    if (err) return cb(err);
    var ret = stream
      .pipe(es.split())
      .pipe(es.through(function write (data, encoding) {
        if (data) this.emit('data', data);
      }))
    cb(null, ret);
  });
};
