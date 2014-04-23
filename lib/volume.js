var fs = require('./fs')
  , path = require('./path')
  , meta = require('./meta')
  , crypto = require('./crypto')
  , keygen = require('ssh-keygen2')
  , debug = require('debug')('kafs:volume')
  , es = require('event-stream')
  , zlib = require('zlib')
  , idgen = require('idgen')
  , version = require('../package.json').version
  , strs = require('stringstream')
  , minimatch = require('minimatch')
  , rreaddir = require('rreaddir')

module.exports = exports = {
  /**
   * p: file path to the new volume (cannot already exist)
   * options:
   *   - depth (number, directory partitioning depth, default 3)
   *   - mode (number, mode for directories, default 0700)
   *   - keypair (boolean, whether to generate keys for this volume)
   *   - bits (number, only used if keypair: true, default 2048)
   *   - password (string, only used if keypair: true)
   * cb: called with (err, volume)
   */
  init: function (p, opts, cb) {
    var debug = require('debug')('kafs:volume:init');
    if (typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    opts || (opts = {});
    opts.depth = typeof opts.depth === 'number' ? opts.depth : 3;
    opts.mode = typeof opts.mode === 'number' ? opts.mode : 0700;
    debug('init', opts);

    var id = idgen();

    fs.exists(path.join(p, 'kafs.json'), function (exists) {
      if (exists) return cb(new Error('cannot init: path already exists'));
      debug('p does not exist', p);
      fs.mkdirp(p, opts.mode, function (err) {
        if (err) return cb(err);
        debug('made dir');

        var manifest = {
          id: id,
          kafs: version,
          created: new Date().getTime(),
          depth: opts.depth
        };

        if (opts.keypair) writeKeys();
        else writeManifest();

        function writeManifest () {
          meta.write(path.join(p, 'kafs'), manifest, function (err) {
            if (err) return cb(err);
            exports.load(p, cb);
          });
        }

        function writeKeys () {
          manifest.password = !!opts.password;
          keygen({
            bits: opts.bits,
            location: path.join(p, 'key'),
            password: opts.password,
            comment: 'kafs:' + id,
            keep: true
          }, function (err, keypair) {
            if (err) return cb(err);
            debug('key', keypair);
            manifest.pubkey = keypair.public.replace(/\s*$/, '');
            manifest.fingerprint = keypair.fingerprint;
            writeManifest();
          });
        }
      });
    });
  },
  /**
   * p: directory path of volume to load
   * cb: called with (err, volume)
   */
  load: function (p, opts, cb, keyring) {
    var debug = require('debug')('kafs:volume:load');
    if (typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    opts || (opts = {});

    if (typeof opts.keyring === 'string' && !keyring) {
      // load keyring volume
      debug('loading keyring', opts.keyring);
      exports.load(opts.keyring, function (err, vol) {
        if (err) return cb(err);
        exports.load(p, opts, cb, vol);
      });
      return;
    }
    debug('load', p);

    var volPath = p
      , metaPath = path.join(volPath, 'kafs')

    meta.read(metaPath, function (err, volume) {
      if (err) return cb(err);
      debug('read meta', volume);
      if (!volume) {
        debug('p', p);
        debug('opts', opts);
        debug('cb', cb);
        debug('metapath', metaPath);
        return cb(new Error('volume not found'));
      }

      // if this volume has a keypair, and no keyring is specified, use itself
      // as the keyring.
      if (!keyring && !opts.keyring && volume.pubkey) {
        keyring = volume;
      }

      // return a real path for a virtual file path
      // if no virtual path is given, return the volume's real path.
      volume.path = function (p) {
        return path.join(volPath, p ? path.hash(p, volume.depth) : '');
      }

      // return a writable stream for a file
      volume.write = function (p, opts, cb) {
        var debug = require('debug')('kafs:volume:write');
        debug('write', volume.id, p);
        if (typeof opts === 'function') {
          cb = opts;
          opts = {};
        }
        opts || (opts = {});
        var key;
        var dirname = path.dirname(p);

        debug('create write stream');
        volume.stat(p, function (err, stat) {
          if (err && err.code === 'ENOENT') {
            err = null;
            stat = {
              kafs: version,
              type: opts.type || 'file',
              path: path.resolve(path.sep, p),
              created: new Date().getTime()
            };
          }
          debug('err', err);
          if (err) return onErr(err);
          if (opts.cipher) stat.cipher = String(opts.cipher);
          if (typeof opts.gzip === 'boolean') stat.gzip = opts.gzip;
          if (opts.key) stat.key = String(opts.key);
          var pipeline = [];

          stat.size_raw = 0;
          stat.size_encoded = 0;

          var hash = crypto.createHash('sha256');

          pipeline.push(es.through(function write (data, encoding) {
            if (typeof data === 'undefined') return;
            debug('data to write', data, encoding);
            hash.update(data, encoding);
            stat.size_raw += Buffer(data, encoding).length;
            debug('emit data', data);
            this.emit('data', data, encoding);
          }, function end () {
            stat.digest = idgen(hash.digest());
            debug('emit end');
            this.emit('end');
          }));

          if (stat.gzip) pipeline.push(zlib.createGzip());

          if (stat.cipher && stat.cipher !== 'rsa') {
            if (opts.password) {
              pipeline.push(crypto.createCipher(stat.cipher, opts.password));
              normalPipeline();
            }
            else if (stat.key) {
              debug('write stream get key', stat.key);
              keyring.getKey(stat.key, function (err, _key) {
                if (err) return onErr(err);
                debug('write stream got key', _key, stat.cipher);
                key = _key;
                pipeline.push(crypto.createCipher(stat.cipher, key.password));
                normalPipeline();
              });
            }
            else {
              debug('write stream create key');
              keyring.createKey(function (err, _key) {
                if (err) return onErr(err);
                debug('write stream created key', _key, stat.cipher);
                key = _key;
                stat.key = key.id;
                pipeline.push(crypto.createCipher(stat.cipher, key.password));
                normalPipeline();
              });
            }
          }
          else normalPipeline();

          function normalPipeline () {
            // final tally
            var finalDigest = crypto.createHash('sha256');
            pipeline.push(es.through(function write (data, encoding) {
              stat.size_encoded += Buffer(data, encoding).length;
              finalDigest.update(data, encoding);
              this.emit('data', data, encoding);
              debug('more data', data);
            }, function end () {
              var self = this;
              stat.digest_final = idgen(finalDigest.digest());
              if (stat.digest === stat.digest_final) delete stat.digest_final;
              stat.updated = new Date().getTime();
              stat.hash = crypto.hashObject(stat);
              if (opts.sign) {
                keyring.sign(stat, function (err) {
                  if (err) return cb(err);
                  withSignature();
                });
              }
              else withSignature();

              function withSignature () {
                if (stat.cipher) {
                  // encrypt protected headers. if key was used to encrypt payload,
                  // use that. otherwise use opts.password. 'rsa' cipher hard-coded
                  // to use aes-256-cbc with passed-in password.
                  var cipher;
                  if (key) cipher = crypto.createCipher(stat.cipher, key ? key.password : opts.password);
                  else cipher = crypto.createCipher(stat.cipher === 'rsa' ? 'aes-256-cbc' : stat.cipher, opts.password);

                  var _protected = cipher.update(meta.stringify(stat), 'utf8');
                  stat = {
                    hash: stat.hash,
                    cipher: stat.cipher,
                    key: stat.key,
                    _protected: idgen(Buffer.concat([_protected, cipher.final()]))
                  };
                  if (!stat.key) delete stat.key;
                  debug('updated stat', stat);
                }

                debug('writing stat...', volume.path(p));
                meta.write(volume.path(p), stat, function (err) {
                  if (err) return stream.emit('error', err);
                  debug('wrote stat', volume.path(p));
                  if (opts.type !== 'dir' && !opts.hidden) {
                    volume.updateIndex('+', p, function (err) {
                      if (err) return cb(err);
                      debug('updated index', p);
                      self.emit('end');
                    });
                  }
                  else self.emit('end');
                });
              }
            }));

            debug('making dir...', path.dirname(volume.path(p)));
            fs.mkdirp(path.dirname(volume.path(p)), 0700, function (err) {
              debug('err', err);
              if (err) return onErr(err);
              // write to fs
              var writeStream = fs.createWriteStream(volume.path(p), {mode: opts.mode});
              pipeline.push(writeStream);
              var stream = es.pipeline.apply(es, pipeline);
              writeStream.on('finish', function () {
                stream.emit('end');
                stream.emit('finish');
              });
              debug('made stream');
              cb(null, stream);
            });
          }
        });
      };

      // import a file from another volume
      volume.import = function (stat, cb) {
        var debug = require('debug')('kafs:volume:import');
      };

      // return stat and a readable stream for a virtual path
      volume.read = function (p, opts, cb) {
        var debug = require('debug')('kafs:volume:read');
        debug('read', volume.id, p);
        if (typeof opts === 'function') {
          cb = opts;
          opts = {};
        }
        opts || (opts = {});
        volume.stat(p, function (err, stat) {
          if (err) return cb(err);
          var readStream = fs.createReadStream(volume.path(p));
          var pipeline = [readStream];

          function addDecipher (pipeline, cb) {
            if (!opts.raw && stat.cipher && (opts.password || (stat.key && keyring))) {
              debug('reading encrypted', stat.cipher);
              if (opts.password) {
                debug('decrypting with password');
                pipeline.push(crypto.createDecipher(stat.cipher, opts.password));
                cb();
              }
              else {
                debug('decrypting with key', stat.key);
                keyring.getKey(stat.key, function (err, key) {
                  if (err) return cb(err);
                  debug('got key to decrypt with', key);
                  pipeline.push(crypto.createDecipher(stat.cipher, key.password));
                  cb();
                });
              }
            }
            else cb();
          }

          addDecipher(pipeline, function () {
            if (!opts.raw && stat.gzip) pipeline.push(zlib.createGunzip());
            if (opts.encoding) pipeline.push(strs(opts.encoding));
            var stream = es.pipeline.apply(es, pipeline);
            if (opts.verify) {
              var mismatch = true;
              stream
                .pipe(crypto.hashStream())
                .on('data', function (hash) {
                  if (hash === stat.digest) mismatch = false;
                })
                .on('end', function () {
                  if (mismatch) return cb(new Error('hash mismatch'));
                  keyring.verify(stat, function (err) {
                    if (err) return cb(err);
                    var pipeline = [fs.createReadStream(volume.path(p))];
                    addDecipher(pipeline, function () {
                      if (!opts.raw && stat.gzip) pipeline.push(zlib.createGunzip());
                      if (opts.encoding) pipeline.push(strs(opts.encoding));
                      cb(null, es.pipeline.apply(es, pipeline));
                    });
                  });
                })
            }
            else {
              debug('returning read stream', pipeline.length);
              cb(null, stream, stat);
            }
          });
        });
      };

      volume.unlink = function (p, cb) {
        var debug = require('debug')('kafs:volume:unlink');
        volume.stat(p, function (err, stat) {
          if (err) return cb(err);
          debug('removing', volume.path(p) + '.json');
          fs.unlink(volume.path(p) + '.json', function (err) {
            if (err) return cb(err);
            debug('removing', volume.path(p));
            fs.unlink(volume.path(p), function (err) {
              if (err) return cb(err);
              volume.updateIndex('-', p, cb);
            });
          });
        });
      };

      volume.stat = function (p, cb) {
        var debug = require('debug')('kafs:volume:stat');
        debug('stat', volume.id, p);
        meta.read(volume.path(p), function (err, stat) {
          debug('stat?', stat);
          if (err) return cb(err);
          if (stat._protected && stat.key && stat.cipher && keyring) {
            debug('getting key', stat.key);
            keyring.getKey(stat.key, function (err, key) {
              if (err) return cb(err);
              var decipher = crypto.createDecipher(stat.cipher, key.password);
              try {
                debug('deciphering stat');
                var _protected = decipher.update(stat._protected, 'base64', 'utf8');
                _protected += decipher.final('utf8');
                debug('_protected', _protected);
                _protected = JSON.parse(_protected);
                cb(null, _protected);
              }
              catch (e) {
                debug('e', e);
                cb(e);
              }
            });
          }
          else cb(null, stat);
        });
      };

      volume.updateIndex = function (op, p, cb) {
        var debug = require('debug')('kafs:volume:updateIndex');
        debug('updateIndex', op, p);
        var tmp = '/';
        var parts = path.resolve('/', p).split('/').map(function (part) {
          var ret = path.join(tmp, part);
          tmp = ret;
          return ret;
        });
        // @todo: encrypt dir listings?
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
              volume.write(dir, {type: 'dir', gzip: true, cipher: keyring && 'aes-256-cbc'}, function (err, stream) {
                if (err) return cb(err);
                stream.on('end', function () {
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
            if (err || !next) return cb(err);
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
                  volume.write(dir, function (err, stream) {
                    if (err) return cb(err);
                    es.readArray(files)
                      .pipe(es.join('\n'))
                      .pipe(stream)
                      .on('end', function () {
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

      volume.readdir = function (p, opts, cb) {
        if (typeof opts === 'function') {
          cb = opts;
          opts = {};
        }
        opts || (opts = {});
        var debug = require('debug')('kafs:volume:readdir');
        debug('readdir', p, opts);
        if (opts.recursive) return volume.rreaddir(p, opts, cb);
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

      volume.rreaddir = function (p, opts, cb) {
        if (typeof opts === 'function') {
          cb = opts;
          opts = {};
        }
        opts || (opts = {});
        opts.fs = volume.fs;
        return rreaddir(p, opts, cb);
      };

      volume.export = function (p, opts, cb) {
        if (typeof opts === 'function') {
          cb = opts;
          opts = {};
        }
        opts || (opts = {});
        if (typeof opts.include === 'string') opts.include = opts.include.split(',');
        if (typeof opts.exclude === 'string') opts.exclude = opts.exclude.split(',');

        function shouldExport (file) {
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

        volume.readdir('/', {recursive: true, stat: true}, function (err, files) {
          if (err) return cb(err);
          var latch = 0, errored = false;
          function onErr (err) {
            if (errored) return;
            errored = true;
            cb(err);
          }

          files.forEach(function (file) {
            if (!shouldExport(file)) return;
            var dir, dest;

            if (file.stat.isFile()) {
              dest = path.join(p, path.relative('/', file.path));
              dir = path.dirname(dest);
            }
            else if (file.stat.isDirectory()) {
              dir = file.path;
            }

            latch++;
            fs.mkdirp(dir, function (err) {
              if (err) return onErr(err);
              if (dest) {
                volume.fs.createReadStream(file.path)
                  .pipe(fs.createWriteStream(dest))
                  .on('error', onErr)
                  .on('finish', function () {
                    if (!--latch) cb();
                  });
              }
              else if (!--latch) cb();
            });
          });
        });
      };

      volume.toJSON = function () {
        var debug = require('debug')('kafs:volume:toJSON');
        var ret = {}, self = this;
        Object.keys(this).forEach(function (k) {
          if (k === 'keyring' || k === 'privateKey' || k === 'publicKey' || k === 'fs') return;
          ret[k] = self[k];
        });
        return ret;
      };

      if (keyring) {
        volume.keyring = keyring;
        crypto.keyring(volume.keyring);
      }

      volume.fs = fs.emulate(volume);

      debug('returning volume', volume);

      cb(null, volume);
    });
  }
};
