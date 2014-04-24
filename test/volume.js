var idgen = require('idgen')
  , rimraf = require('rimraf')
  , path = require('path')
  , meta = require('../lib/meta')
  , glob = require('glob')
  , rreaddir = require('rreaddir')

describe('volume', function () {
  var p = '/tmp/kafs-test-' + idgen(), volume, volume2;
  after(function (done) {
    if (process.env.DEBUG) return done();
    rimraf(p, function (err) {
      done(err);
    });
  });

  it('init keyring', function (done) {
    kafs.init(path.join(p, 'keyring'), {keypair: true}, function (err, vol) {
      assert.ifError(err);
      assert(vol.created > 1397612079059);
      assert.strictEqual(vol.id.length, 16);
      assert(vol.pubkey.match(/^ssh-rsa /));
      assert(vol.fingerprint.length);
      assert.strictEqual(vol.depth, 3);
      done();
    });
  });

  it('load keyring', function (done) {
    kafs(path.join(p, 'keyring'), function (err, vol) {
      assert.ifError(err);
      assert(vol.created > 1397612079059);
      volume = vol;
      done();
    });
  });

  it('init data', function (done) {
    kafs.init(path.join(p, 'data'), {keyring: path.join(p, 'keyring')}, function (err, vol) {
      assert.ifError(err);
      assert(vol.created > 1397612079059);
      assert.strictEqual(vol.id.length, 16);
      assert(vol.id !== volume.id);
      assert(!vol.pubkey);
      assert(!vol.fingerprint);
      assert.strictEqual(vol.depth, 3);
      done();
    });
  });

  it('load data', function (done) {
    kafs(path.join(p, 'data'), {keyring: path.join(p, 'keyring')}, function (err, vol) {
      assert.ifError(err);
      assert.strictEqual(meta.stringify(vol.keyring), meta.stringify(volume));
      volume = vol;
      done();
    });
  });

  it('write', function (done) {
    volume.write('tests/README.md', function (err, stream) {
      assert.ifError(err);
      require('fs').createReadStream(require('path').resolve(__dirname, '..', 'README.md'))
        .pipe(stream)
        .on('finish', done);
    });
  });

  it('stat', function (done) {
    volume.stat('tests/README.md', function (err, stat) {
      assert.ifError(err);
      assert(stat.digest);
      assert(!stat.digest_final);
      assert.equal(stat.size_encoded, stat.size_raw);
      done();
    });
  });

  it('read', function (done) {
    volume.read('tests/README.md', function (err, stream) {
      assert.ifError(err);
      stream.setEncoding('utf8');
      var content = '';
      stream.on('data', function (data) {
        content += data;
      });
      stream.on('end', function () {
        assert(content.match(/Virtual file system/));
        done();
      });
    });
  });

  it('write gzipped', function (done) {
    volume.write('tests/gzip/README.md', {gzip: true}, function (err, stream) {
      assert.ifError(err);
      require('fs').createReadStream(require('path').resolve(__dirname, '..', 'README.md'))
        .pipe(stream)
        .on('finish', done);
    });
  });

  it('stat gzipped', function (done) {
    volume.stat('tests/gzip/README.md', function (err, stat) {
      assert.ifError(err);
      assert(stat.gzip);
      assert(!stat.cipher);
      assert(stat.digest);
      assert(stat.digest_final);
      assert(stat.digest != stat.digest_final);
      assert.notEqual(stat.size_encoded, stat.size_raw);
      done();
    });
  });

  it('read gzipped', function (done) {
    volume.read('tests/gzip/README.md', function (err, stream) {
      assert.ifError(err);
      var content = '';
      stream.on('data', function (data) {
        content += data;
      });
      stream.on('end', function () {
        assert(content.match(/Virtual file system/));
        done();
      });
    });
  });

  it('write encrypted', function (done) {
    volume.write('tests/encrypted/README.md', {cipher: 'aes-256-cbc'}, function (err, stream) {
      assert.ifError(err);
      require('fs').createReadStream(require('path').resolve(__dirname, '..', 'README.md'))
        .pipe(stream)
        .on('finish', done);
    });
  });

  it('stat encrypted', function (done) {
    volume.stat('tests/encrypted/README.md', function (err, stat) {
      assert.ifError(err);
      assert.equal(stat.cipher, 'aes-256-cbc');
      assert(!stat.gzip);
      assert(stat.digest);
      assert(stat.digest_final);
      assert(stat.digest != stat.digest_final);
      assert.notEqual(stat.size_encoded, stat.size_raw);
      done();
    });
  });

  it('read encrypted', function (done) {
    volume.read('tests/encrypted/README.md', function (err, stream) {
      assert.ifError(err);
      var content = '';
      stream.on('data', function (data) {
        content += data;
      });
      stream.on('end', function () {
        assert(content.match(/Virtual file system/));
        done();
      });
    });
  });

  it('write gzip/encrypted', function (done) {
    volume.write('tests/gzip+encrypted/README.md', {gzip: true, cipher: 'aes-256-cbc'}, function (err, stream) {
      assert.ifError(err);
      require('fs').createReadStream(require('path').resolve(__dirname, '..', 'README.md'))
        .pipe(stream)
        .on('finish', done);
    });
  });

  it('stat encrypted', function (done) {
    volume.stat('tests/gzip+encrypted/README.md', function (err, stat) {
      assert.ifError(err);
      assert.equal(stat.cipher, 'aes-256-cbc');
      assert(stat.gzip);
      assert(stat.digest);
      assert(stat.digest_final);
      assert(stat.digest != stat.digest_final);
      assert.notEqual(stat.size_encoded, stat.size_raw);
      done();
    });
  });

  it('readdir', function (done) {
    volume.readdir('tests', function (err, stream) {
      assert.ifError(err);
      var files = [];
      stream
        .on('data', function (data) {
          files.push(data);
        })
        .on('end', function () {
          assert.deepEqual(files, ['README.md', 'gzip', 'encrypted', 'gzip+encrypted']);
          done();
        });
    });
  });

  it('unlink', function (done) {
    volume.unlink('tests/gzip+encrypted/README.md', function (err) {
      assert.ifError(err);
      volume.stat('tests/gzip+encrypted/README.md', function (err, stat) {
        assert.equal(err.code, 'ENOENT');
        done();
      });
    });
  });

  it('readdir again', function (done) {
    volume.readdir('tests/gzip+encrypted', function (err, stream) {
      assert.ifError(err);
      var files = [];
      stream
        .on('data', function (data) {
          files.push(data);
        })
        .on('end', function () {
          assert.deepEqual(files, []);
          done();
        });
    });
  });

  it('write with signature', function (done) {
    volume.write('tests/signed/README.md', {sign: true, cipher: 'aes-256-cbc'}, function (err, stream) {
      assert.ifError(err);
      require('fs').createReadStream(require('path').resolve(__dirname, '..', 'README.md'))
        .pipe(stream)
        .on('finish', done);
    });
  });

  it('stat with signature', function (done) {
    volume.stat('tests/signed/README.md', function (err, stat) {
      assert.ifError(err);
      assert.equal(stat.cipher, 'aes-256-cbc');
      //assert(stat.gzip);
      assert(stat.digest);
      assert(stat.digest_final);
      assert(stat.digest != stat.digest_final);
      assert.notEqual(stat.size_encoded, stat.size_raw);
      volume.keyring.crypto.verify(stat, function (err) {
        assert.ifError(err);
        done();
      });
    });
  });

  it('read with verification', function (done) {
    volume.read('tests/signed/README.md', {verify: true}, function (err, stream) {
      assert.ifError(err);
      var content = '';
      stream.on('data', function (data) {
        content += data;
      });
      stream.on('end', function () {
        assert(content.match(/Virtual file system/));
        done();
      });
    });
  });

  it('add excluded file', function (done) {
    volume.fs.writeFile('tests/blah', 'blah!', function (err) {
      assert.ifError(err);
      volume.fs.readFile('tests/blah', {encoding: 'utf8'}, function (err, data) {
        assert.ifError(err);
        assert.equal(data, 'blah!');
        done();
      });
    });
  });

  it('recursive readdir', function (done) {
    volume.readdir('./', {recursive: true, mark: true}, function (err, files) {
      assert.ifError(err);
      assert.deepEqual(files.sort(), [
        'tests/',
        'tests/README.md',
        'tests/blah',
        'tests/encrypted/',
        'tests/encrypted/README.md',
        'tests/gzip+encrypted/',
        'tests/gzip/',
        'tests/gzip/README.md',
        'tests/signed/',
        'tests/signed/README.md'
      ]);
      done();
    });
  });

  it('export', function (done) {
    var dir = path.join(p, 'export');
    volume.export(dir, {include: ['**/README.md', 'tests/*'], exclude: 'tests/README.*'}, function (err) {
      assert.ifError(err);
      var olddir = process.cwd();
      process.chdir(dir);
      rreaddir('./', {mark: true}, function (err, files) {
        process.chdir(olddir);
        assert.ifError(err);
        assert.deepEqual(files.sort(), [
          'tests/',
          'tests/README.md',
          'tests/encrypted/',
          'tests/encrypted/README.md',
          'tests/gzip/',
          'tests/gzip/README.md',
          'tests/signed/',
          'tests/signed/README.md'
        ]);
        done();
      });
    });
  });

  it('init new', function (done) {
    kafs.init(path.join(p, 'data2'), {keyring: path.join(p, 'keyring')}, function (err, vol) {
      assert.ifError(err);
      assert(vol.created > 1397612079059);
      assert.strictEqual(vol.id.length, 16);
      assert(vol.id !== volume.id);
      assert(!vol.pubkey);
      assert(!vol.fingerprint);
      assert.strictEqual(vol.depth, 3);
      volume2 = vol;
      done();
    });
  });

  it('new is empty', function (done) {
    volume2.readdir('/', {recursive: true}, function (err, files) {
      assert.ifError(err);
      assert.equal(files.length, 0);
      done();
    });
  });

  it('import', function (done) {
    var dir = path.join(p, 'export');
    volume2.import(dir, {prefix: 'imported'}, function (err) {
      assert.ifError(err);
      volume2.readdir('./', {recursive: true, mark: true}, function (err, files) {
        assert.ifError(err);
        assert.deepEqual(files.sort(), [
          'imported/',
          'imported/tests/',
          'imported/tests/README.md',
          'imported/tests/encrypted/',
          'imported/tests/encrypted/README.md',
          'imported/tests/gzip/',
          'imported/tests/gzip/README.md',
          'imported/tests/signed/',
          'imported/tests/signed/README.md'
        ]);
        done();
      });
    });
  });

  it('mount', function (done) {
    var dir = path.join(p, 'mount');
    volume2.mount(dir, function (err, s) {
      assert.ifError(err);
      var olddir = process.cwd();
      process.chdir(dir);
      rreaddir('./', {mark: true}, function (err, files) {
        process.chdir(olddir);
        assert.ifError(err);
        assert.deepEqual(files.sort(), [
          'imported/',
          'imported/tests/',
          'imported/tests/README.md',
          'imported/tests/encrypted/',
          'imported/tests/encrypted/README.md',
          'imported/tests/gzip/',
          'imported/tests/gzip/README.md',
          'imported/tests/signed/',
          'imported/tests/signed/README.md'
        ]);
        done();
      });
    });
  });
});