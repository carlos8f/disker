var fs = require('graceful-fs')
  , stringify = require('json-stable-stringify')

process.on('uncaughtException', function (err) {
  console.log('uncaught!', err.stack || err);
  process.exit();
});

exports.read = function (p, cb) {
  var debug = require('debug')('kafs:meta:read');
  if (!p.match(/\.json$/)) p += '.json';
  debug('read', p);
  fs.readFile(p, {encoding: 'utf8'}, function (err, raw) {
    debug('err', err);
    debug('raw', raw);
    if (err) return cb(err);
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
  var debug = require('debug')('kafs:meta:write');
  if (!p.match(/\.json$/)) p += '.json';
  debug('writing', p);
  data = exports.stringify(data);
  debug('data', data);
  fs.writeFileSync(p, data, {mode: 0644});
  cb();
};

exports.stringify = function (data) {
  return stringify(data, {space: '  '});
};
