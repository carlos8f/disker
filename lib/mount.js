var saw = require('saw')
  , fs = require('./fs')
  , path = require('./path')
  , crypto = require('./crypto')

module.exports = function (volume, p, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }
  opts || (opts = {});

  fs.mkdirp(p, function (err) {
    if (err) return cb(err);
    fs.readdir(p, function (err, files) {
      if (err) return cb(err);
      if (files.length) return cb(new Error('mount: directory not empty'));
      volume.export(p, opts, function (err) {
        if (err) return cb(err);
        var s = saw(p)
          .on('all', function (ev, file) {
            switch (ev) {
              case 'add':
              case 'update':
                fs.createReadStream(file.path)
                  .on('error', function (err) {
                    s.emit('error', err);
                  })
                  .pipe(crypto.hashStream())
                  .on('data', function (hash) {
                    volume.stat(file.path, function (err, stat) {
                      if (err) return s.emit('error', err);
                      if (stat.digest !== hash) {
                        volume.write(file.path, {emit: false, gzip: true, cipher: volume.keyring ? 'aes-256-cbc' : null}, function (err, stream) {
                          if (err) return s.emit('error', err);
                          fs.createReadStream(file.path)
                            .on('error', function (err) {
                              s.emit('error', err);
                            })
                            .pipe(stream)
                            .on('error', function (err) {
                              s.emit('error', err);
                            })
                        });
                      }
                    });
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
            cb(null, s);
          });

        volume.on('+', function (stat) {
          volume.read(stat.path, function (err, stream) {
            if (err) return s.emit('error', err);
            var relpath = path.relative('/', stat.path);
            stream
              .on('error', function (err) {
                s.emit('error', err);
              })
              .pipe(fs.createWriteStream(path.join(p, relpath)))
              .on('error', function (err) {
                s.emit('error', err);
              })
          });
        });

        volume.on('-', function (stat) {
          var relpath = path.relative('/', stat.path);
          fs.unlink(relpath, function (err) {
            if (err) return s.emit('error', err);
          });
        });
      });
    });
  });
};
