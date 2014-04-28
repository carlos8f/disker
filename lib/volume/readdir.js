var es = require('event-stream')
  , rreaddir = require('rreaddir')
  , path = require('path')

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
  var ret = [];
  this.meta.collection(p, function (err, chunk, next) {
    if (err) return cb(err);
    ret = ret.concat(chunk);
    if (chunk.length) next();
    else cb(null ret);
  }); 
};
