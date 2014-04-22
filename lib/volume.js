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

module.exports = exports = {
  /**
   * p: file path to the new volume (cannot already exist)
   * options:
   *   - depth (number, directory partitioning depth, default 3)
   *   - mode (number, mode for directories, default 0700)
   *   - keypair (boolean, whether to generate keys for this volume)
   *   - bits (number, only used if keyring: true, default 2048)
   *   - password (string, only used if keyring: true)
   * cb: called with (err, volume)
   */
  init: function (p, opts, cb) {
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
          meta.write(path.join(p, 'kafs'), manifest, function (err) {
            if (err) return cb(err);
            exports.load(p, cb);
          });
        });
      });
    });
  },
  /**
   * p: directory path of volume to load
   * cb: called with (err, volume)
   */
  load: function (p, opts, cb, keyring) {
    if (typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    opts || (opts = {});

    if (typeof opts.keyring === 'string' && !keyring) {
      // load keyring volume
      exports.load(opts.keyring, function (err, vol) {
        if (err) return cb(err);
        exports.load(p, opts, cb, vol);
      });
      return;
    }

    var volPath = p
      , metaPath = path.join(volPath, 'kafs')

    meta.read(metaPath, function (err, volume) {
      if (err) return cb(err);
      if (!volume) {
        debug('p', p);
        debug('opts', opts);
        debug('cb', cb);
        debug('metapath', metaPath);
        return cb(new Error('volume not found: ' + p));
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

      volume.mkdirp = function (p, cb) {
        var tmp = '';
        var parts = p.replace(/^\//, '').split('/').map(function (part) {
          var ret = path.join(tmp, part);
          tmp = ret;
          return ret;
        });
        // keys dir can't be encrypted, because that would cause a loop
        // @todo: fix this?
        var cipher = parts[0] === 'keys' ? null : 'aes-256-cbc';
        debug('parts', parts);

        (function makePart (idx) {
          var dir = parts[idx];
          if (!dir) return cb();
          debug('read', dir);
          volume.read(dir, function (err, stream) {
            debug('makepart read stream', err);
            if (err && err.code === 'ENOENT') {
              debug('no ent', dir);
              volume.write(dir, {type: 'dir', cipher: cipher}, function (err, stream) {
                if (err) return cb(err);
                stream.on('end', function () {
                  makePart(idx + 1);
                });
                var content = '';
                if (parts[idx + 1]) {
                  content += path.basename(parts[idx + 1]) + '\n';
                }
                stream.write(content);
                stream.end();
              });
              return;
            }
            if (err) return cb(err);
            var chunks = [];
            stream
              .on('data', function (data) {
                chunks.push(data);
              })
              .on('end', function () {
                var content = Buffer.concat(chunks).toString('utf8');
                if (parts[idx + 1]) {
                  var next = path.basename(parts[idx + 1]);
                  debug('next part', next);
                  if (!~content.indexOf(next + '\n')) {
                    debug('adding to index', next);
                    content += next + '\n';
                    volume.write(dir, {type: 'dir', cipher: cipher}, function (err, stream) {
                      if (err) return cb(err);
                      debug('added to index', next);
                      stream.on('end', function () {
                        makePart(idx + 1);
                      });
                      stream.write(content);
                      stream.end();
                    });
                  }
                  else {
                    debug('make next part', next);
                    makePart(idx + 1);
                  }
                }
                else cb();
              })
              .on('error', cb);
          });
        })(0);
      }

      // return a writable stream for a file
      volume.write = function (p, opts, cb) {
        debug('write', volume.id, p);
        if (typeof opts === 'function') {
          cb = opts;
          opts = {};
        }
        opts || (opts = {});
        var key;
        var dirname = path.dirname(p);
        if (opts.type !== 'dir' && dirname) {
          debug('making dir', dirname);
          volume.mkdirp(dirname, function (err) {
            if (err) return cb(err);
            createWriteStream();
          });
        }
        else createWriteStream();

        function createWriteStream () {
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
              hash.update(data, encoding);
              stat.size_raw += Buffer(data, encoding).length;
              debug('emit data', data);
              this.emit('data', data, encoding);
            }, function end () {
              stat.digest = idgen(hash.digest());
              debug('emit end');
              this.emit('end');
            }));

            if (stat.cipher && stat.cipher !== 'rsa') {
              if (opts.password) {
                pipeline.push(crypto.createCipher(stat.cipher, opts.password));
                normalPipeline();
              }
              else if (stat.key) {
                debug('write stream get key', stat.key);
                crypto.getKey(keyring, stat.key, function (err, _key) {
                  if (err) return onErr(err);
                  debug('write stream got key', _key, stat.cipher);
                  key = _key;
                  pipeline.push(crypto.createCipher(stat.cipher, key.password));
                  normalPipeline();
                });
              }
              else {
                debug('write stream create key');
                crypto.createKey(keyring, function (err, _key) {
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
              if (stat.gzip) {
                pipeline.push(zlib.createGzip());
              }

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
                // @todo: encrypt protected headers, including path
                stat.hash = crypto.hashObject(stat);
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
                  self.emit('end');
                });
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
        }
      };

      // import a file from another volume
      volume.import = function (stat, cb) {

      };

      // return stat and a readable stream for a virtual path
      volume.read = function (p, opts, cb) {
        debug('read', volume.id, p);
        if (typeof opts === 'function') {
          cb = opts;
          opts = {};
        }
        opts || (opts = {});
        volume.stat(p, function (err, stat) {
          debug('read err', err);
          debug('read stat', stat);
          if (err) return cb(err);
          var readStream = fs.createReadStream(volume.path(p));
          var pipeline = [readStream];
          if (!opts.raw && stat.cipher && (opts.password || (stat.key && keyring))) {
            if (opts.password) {
              pipeline.push(crypto.createDecipher(stat.cipher, opts.password));
              withDecipher();
            }
            else {
              crypto.getKey(keyring, stat.key, function (err, key) {
                if (err) return cb(err);
                pipeline.push(crypto.createDecipher(stat.cipher, key.password));
                withDecipher();
              });
            }
          }
          else withDecipher();

          function withDecipher () {
            if (!opts.raw && stat.gzip) {
              pipeline.push(zlib.createGunzip());
            }
            debug('returning read stream', pipeline.length);
            cb(null, es.pipeline.apply(es, pipeline));
          }
        });
      };

      volume.unlink = function (p, cb) {
        volume.stat(p, function (err, stat) {
          if (err) return cb(err);
          fs.unlink(volume.path(p) + '.json', function (err) {
            if (err) return cb(err);
            fs.unlink(volume.path(p), cb);
          });
        });
      };

      volume.stat = function (p, cb) {
        debug('stat', volume.id, p);
        meta.read(volume.path(p), function (err, stat) {
          debug('stat?', stat);
          if (err) return cb(err);
          if (stat._protected && stat.key && stat.cipher && keyring) {
            debug('getting key', stat.key);
            crypto.getKey(keyring, stat.key, function (err, key) {
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

      volume.readdir = function (p, cb) {

      };

      if (keyring) volume.keyring = keyring;

      volume.toJSON = function () {
        var ret = {}, self = this;
        Object.keys(this).forEach(function (k) {
          if (k === 'keyring' || k === 'privateKey' || k === 'publicKey') return;
          ret[k] = self[k];
        });
        return ret;
      };

      cb(null, volume);
    });
  }
};
