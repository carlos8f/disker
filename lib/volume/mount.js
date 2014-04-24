var saw = require('saw')
  , fs = require('graceful-fs')
  , path = require('path')
  , hash = require('../hash')
  , mkdirp = require('mkdirp')

module.exports = function (p, opts, cb) {
  var volume = this;
  var debug = require('debug')('kafs:volume:mount');
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }
  opts || (opts = {});
  debug('mount', p);

  p = path.resolve(p);

  mkdirp(p, function (err) {
    if (err) return cb(err);
    fs.readdir(p, function (err, files) {
      if (err) return cb(err);
      if (files.length) return cb(new Error('mount: directory not empty'));
      volume.export(p, opts, function (err) {
        if (err) return cb(err);
        var s = saw(p)
          .on('all', function (ev, file) {
            debug(ev, file);
            if (opts.readonly || file.stat.isDirectory()) return;
            switch (ev) {
              case 'add':
              case 'update':
                volume.stat(file.path, function (err, stat) {
                  if (err && err.code !== 'ENOENT') return s.emit('error', err);

                  function write () {
                    volume.write(file.path, {emit: false, gzip: true, cipher: volume.keyring ? 'aes-256-cbc' : null}, function (err, stream) {
                      if (err) return s.emit('error', err);
                      fs.createReadStream(file.fullPath)
                        .on('error', function (err) {
                          s.emit('error', err);
                        })
                        .pipe(stream)
                        .on('error', function (err) {
                          s.emit('error', err);
                        })
                    });
                  }

                  if (stat) {
                    // compare hashes
                    debug('got stat');
                    fs.createReadStream(file.fullPath)
                    .on('error', function (err) {
                      s.emit('error', err);
                    })
                    .pipe(hash.stream())
                    .on('data', function (hash) {
                      volume.stat(file.path, function (err, stat) {
                        if (err && err.code !== 'ENOENT') return s.emit('error', err);
                        if (!stat || stat.digest !== hash) {
                          debug('hash changed, update', file.path);
                          write();
                        }
                        else debug('already have latest version', file.path);
                      });
                    });
                  }
                  else {
                    debug('new file, add', file.path);
                    write();
                  }
                });
                break;
              case 'remove':
                volume.stat(file.path, function (err, stat) {
                  if (err && err.code === 'ENOENT') return;
                  if (err) return s.emit('error', err);
                  volume.unlink(file.path, {emit: false}, function (err) {
                    if (err) return s.emit('error', err);
                  });
                });
                break;
            }
          })
          .once('ready', function (files) {
            debug('ready');
            s.unmount = function (cb) {
              s.close();
              fs.readdir(p, function (err, files) {
                if (err) return s.emit('error', err);
                var latch = files.length, errored = false;
                if (!latch) return cb && cb();
                function onErr (err) {
                  if (errored) return;
                  errored = true;
                  cb && cb(err);
                }
                files.forEach(function (file) {
                  fs.rimraf(file, function (err) {
                    if (err) return onErr(err);
                    if (!--latch) cb && cb();
                  });
                });
              });
            };
            cb(null, s);
          });

        volume.on('+', function (stat) {
          debug('volume event: plus', stat);
          var relpath = path.relative('/', stat.path);
          if (stat.type === 'dir') {
            mkdirp(path.join(p, relpath), function (err) {
              if (err) return s.emit('error', err);
            });
          }
          else if (stat.type === 'file') {
            volume.read(stat.path, function (err, stream) {
              if (err) return s.emit('error', err);
              stream
                .on('error', function (err) {
                  s.emit('error', err);
                })
                .pipe(fs.createWriteStream(path.join(p, relpath)))
                .on('error', function (err) {
                  s.emit('error', err);
                })
            });
          }
        });

        volume.on('-', function (stat) {
          debug('volume event: minus', stat);
          var relpath = path.join(p, path.relative('/', stat.path));
          fs.unlink(relpath, function (err) {
            if (err) return s.emit('error', err);
          });
        });
      });
    });
  });
};
