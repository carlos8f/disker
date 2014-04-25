var fs = require('graceful-fs')
  , path = require('path')
  , meta = require('../meta')
  , crypto = require('crypto')
  , es = require('event-stream')
  , zlib = require('zlib')
  , idgen = require('idgen')
  , version = require('../../package.json').version
  , mkdirp = require('mkdirp')
  , hash = require('../hash')

module.exports = function (p, opts, cb) {
  var volume = this;
  var debug = require('debug')('kafs:volume:write');
  debug('write', volume.id, p);
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }
  opts || (opts = {});
  var key;
  var dirname = path.dirname(p);

  function onErr (err) {
    volume.unlock(function () {
      cb(err);
    });
  }

  if (!opts.type) opts.type = 'file';
  if (typeof opts.lock === 'undefined') opts.lock = true;

  if (opts.lock) {
    volume.lock(p, function (err) {
      if (err) return onErr(err);
      makeStream();
    });
  }
  else makeStream();

  function makeStream () {
    debug('create write stream');
    volume.stat(p, function (err, stat) {
      if (err && err.code === 'ENOENT') {
        err = null;
        stat = {
          kafs: version,
          type: opts.type || 'file',
          path: path.resolve('/', p),
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

      var sha = crypto.createHash('sha256');

      pipeline.push(es.through(function write (data, encoding) {
        if (typeof data === 'undefined') return;
        //debug('data to write', data, encoding);
        sha.update(data, encoding);
        stat.size_raw += Buffer(data, encoding).length;
        this.emit('data', data, encoding);
      }, function end () {
        stat.digest = idgen(sha.digest());
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
          volume.keyring.crypto.getKey(stat.key, function (err, _key) {
            if (err) return onErr(err);
            debug('write stream got key', _key, stat.cipher);
            key = _key;
            pipeline.push(crypto.createCipher(stat.cipher, key.password));
            normalPipeline();
          });
        }
        else {
          debug('write stream create key');
          volume.keyring.crypto.createKey(function (err, _key) {
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
          //debug('more data', data);
        }, function end () {
          var self = this;
          stat.digest_final = idgen(finalDigest.digest());
          if (stat.digest === stat.digest_final) delete stat.digest_final;
          stat.updated = new Date().getTime();
          stat.hash = hash(stat);
          if (opts.sign) {
            volume.keyring.crypto.sign(stat, function (err) {
              if (err) return onErr(err);
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
              debug('err?', err);
              if (err) return stream.emit('error', err);
              debug('wrote stat', volume.path(p));
              if (opts.type !== 'dir' && !opts.hidden) {
                debug('journaling');
                volume.journal('+', p, {emit: opts.emit}, function (err) {
                  if (err) return onErr(err);
                  debug('updated index', p);
                  self.emit('end');
                });
              }
              else {
                debug('no journaling, emitting end');
                self.emit('end');
              }
            });
          }
        }));

        debug('making dir...', path.dirname(volume.path(p)));
        mkdirp(path.dirname(volume.path(p)), 0700, function (err) {
          debug('err', err);
          if (err) return onErr(err);
          // write to fs
          var writeStream = fs.createWriteStream(volume.path(p), {mode: opts.mode});
          pipeline.push(writeStream);
          var stream = es.pipeline.apply(es, pipeline);
          writeStream.on('finish', function () {
            debug('finish');
            if (opts.lock) {
              debug('unlocking');
              volume.unlock(p, function (err) {
                if (err) return stream.emit('error', err);
                debug('unlocked');
                stream.emit('finish');
              });
            }
            else {
              stream.emit('finish');
            }
          });
          stream.on('end', function () {
            debug('stream end');
          });
          debug('made stream');
          cb(null, stream);
        });
      }
    });
  }
};
