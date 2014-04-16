var fs = require('graceful-fs')
  , stringify = require('json-stable-stringify')

exports.read = function (p, cb) {
  if (!p.match(/\.json$/)) p += '.json';
  fs.readFile(p, {encoding: 'utf8'}, function (err, raw) {
    if (err) return cb(err);
    try {
      cb(null, JSON.parse(raw));
    }
    catch (e) {
      cb(e);
    }
  });
};

exports.write = function (p, data, cb) {
  if (!p.match(/\.json$/)) p += '.json';
  fs.writeFile(p, exports.stringify(data), {mode: 0644}, cb);
};

exports.stringify = function (data) {
  return stringify(data, {space: '  '});
};
