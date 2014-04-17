var fs = require('graceful-fs')
  , stringify = require('json-stable-stringify')
  , debug = require('debug')('kafs:meta')

exports.read = function (p, cb) {
  if (!p.match(/\.json$/)) p += '.json';
  debug('p', p);
  fs.readFile(p, {encoding: 'utf8'}, function (err, raw) {
    if (err) return cb(err);
    debug('raw', raw);
    try {
      var meta = JSON.parse(raw);
    }
    catch (e) {
      debug('parse err', e);
      return cb(e);
    }
    cb(null, meta);
  });
};

exports.write = function (p, data, cb) {
  if (!p.match(/\.json$/)) p += '.json';
  fs.writeFile(p, exports.stringify(data), {mode: 0644}, cb);
};

exports.stringify = function (data) {
  return stringify(data, {space: '  '});
};
