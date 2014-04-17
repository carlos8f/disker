var fs = require('./fs')
  , path = require('./path')
  , meta = require('./meta')
  , crypto = require('./crypto')
  , keygen = require('ssh-keygen')
  , debug = require('debug')('kafs:init')
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

    fs.exists(p, function (exists) {
      if (exists) return cb(new Error('cannot init: path already exists'));
      debug('p does not exist', p);
      fs.mkdirp(p, opts.mode, function (err) {
        if (err) return cb(err);
        debug('made dir');

        var manifest = {
          id: id,
          kafs: version,
          created: new Date().getTime(),
          clock: 0,
          files: 0,
          size_raw: 0,
          size_encoded: 0,
          state: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
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
          keygen({
            bits: opts.bits,
            location: path.join(p, 'key'),
            password: opts.password,
            comment: 'kafs:' + id
          }, function (err, key) {
            if (err) return cb(err);
            debug('key', key);
            keygen({
              location: path.join(p, 'key'),
              fingerprint: true
            }, function (err, fingerprint) {
              if (err) return cb(err);
              debug('fingerprint', fingerprint);
              
              manifest.pubkey = key.pubKey.replace(/\s*$/, '');
              manifest.fingerprint = fingerprint.trim();

              writeManifest();
            });
          });
        }
      });
    });
  },
  /**
   * p: directory path of volume to load
   * cb: called with (err, volume)
   */
  load: function (p, opts, cb) {
    if (typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    opts || (opts = {});

    if (typeof opts.keyring === 'string') {
      // load ` volume
      exports.load(opts.keyring, function (err, keyring) {
        if (err) return cb(err);
        opts.keyring = keyring;
        exports.load(p, opts, cb);
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
      }
      // record original clock value
      var origClock = volume.clock;

      // return a real path for a virtual file path
      // if no virtual path is given, return the volume's real path.
      volume.path = function (p) {
        return path.join(volPath, p ? path.hash(p) : null);
      }

      // save the logical clock and updated timestamp
      volume.save = function (cb) {
        var clockDiff = volume.clock - origClock;
        if (!clockDiff) return cb();
        meta.read(metaPath, function (err, meta) {
          meta.clock += clockDiff;
          meta.updated = new Date().getTime();
          meta.write(metaPath, meta, cb);
        });
      };

      // return a writable stream for a file
      volume.write = function (p, opts, cb) {
        if (typeof opts === 'function') {
          cb = opts;
          opts = {};
        }
        opts || (opts = {});

        volume.stat(p, function (err, stat) {
          if (err && err.code === 'ENOENT') {
            err = null;
            stat = {
              kafs: version,
              path: path.resolve(path.sep, p)
            };
          }
          if (err) return cb(err);
          if (opts.cipher) stat.cipher = String(opts.cipher);
          if (opts.gzip) stat.gzip = !!opts.gzip;
          if (opts.key) stat.key = String(opts.key);
          // @todo: encrypt protected headers
          var pipeline = [];

          stat.size = 0;
          var hash = crypto.createHash('sha256');

          pipeline.push(es.through(function write (data, encoding) {
            hash.update(data, encoding);
          }, function end () {
            stat.digest = idgen(hash.digest());
          }));

          if (stat.cipher) {
            // add cipher to pipeline
          }
          if (stat.gzip) {
            // add gzip to pipeline
          }

          volume.clock++;

          cb(null, es.pipeline.apply(es, pipeline));
        });
      };

      // import a file from another volume
      volume.import = function (stat, cb) {

      };

      // return stat and a readable stream for a virtual path
      volume.read = function (p, cb) {
        volume.stat(p, function (err, stat) {
          if (err) return cb(err);
          // @todo: use streams2
          var readStream = fs.createReadStream(volume.path(p));
          var pipeline = [readStream];
          if (stat.cipher) {
            // if rsa, decrypt secret with private key
            // if aes, look up the secret in key volume
          }
          if (stat.gzip) {
            pipeline.push(zlib.gunzip());
          }

          cb(null, es.pipeline.apply(es, pipeline));
        });

        return stream;
      };

      volume.unlink = function (p, cb) {
        fs.unlink(volume.path(p) + '.json', function (err) {
          if (err) return cb(err);
          fs.unlink(volume.path(p), cb);
        });
      };

      volume.stat = function (p, cb) {
        meta.read(volume.path(p), cb);
      };

      volume.readdir = function (p, cb) {

      };

      cb(null, volume);
    });
  }
};
