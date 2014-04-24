var es = require('event-stream')
  , path = require('path')

module.exports = function (op, p, opts, cb) {
  var volume = this;
  var debug = require('debug')('kafs:volume:journal');
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }
  opts || (opts = {});
  debug('journal', op, p);
  var tmp = '/';
  var parts = path.resolve('/', p).split('/').map(function (part) {
    var ret = path.join(tmp, part);
    tmp = ret;
    return ret;
  });
  debug('parts', parts);

  (function makePart (idx) {
    var dir = parts[idx];
    if (!dir) return cb();
    var next = parts[idx + 1] ? path.basename(parts[idx + 1]) : null;
    debug('makepart', dir, next);
    debug('read', dir);
    volume.read(dir, function (err, stream, stat) {
      debug('makepart read stream', err);
      if (err && err.code === 'ENOENT') {
        debug('no ent', dir);
        if (op === '-') return cb();
        volume.write(dir, {type: 'dir', lock: false, gzip: true, cipher: volume.keyring && 'aes-256-cbc'}, function (err, stream) {
          if (err) return cb(err);
          stream.on('finish', function () {
            makePart(idx + 1);
          });
          if (next) {
            debug('next', typeof next, next);
            es.readArray([next])
              .pipe(es.join('\n'))
              .pipe(stream);
          }
          else stream.end();
        });
        return;
      }
      if (!next) {
        if (op === '+' && opts.emit !== false) volume.emit('+', stat);
        return cb();
      }
      if (err) return cb(err);
      if (stat.type !== 'dir') return cb(new Error('file exists in place of directory'));

      var found = false, files = [];
      debug('parsing existing dir listing', dir);

      stream
        .pipe(es.split())
        .on('data', function (data) {
          if (data === next) {
            found = true;
            debug('FOUND!', dir);
            if (op === '-') return;
          }
          if (data) files.push(data);
        })
        .on('end', function () {
          debug('new files list', files);
          if ((op === '+' && !found) || (op === '-' && found)) {
            if (op === '+') files.push(next);
            debug('index+', files);
            volume.write(dir, {lock: false}, function (err, stream) {
              if (err) return cb(err);
              es.readArray(files)
                .pipe(es.join('\n'))
                .pipe(stream)
                .on('finish', function () {
                  makePart(idx + 1);
                })
                .on('error', cb);
            });
          }
          else {
            debug('make next part', next);
            makePart(idx + 1);
          }
        })
        .on('error', cb);
    });
  })(0);
};
