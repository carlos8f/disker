var idgen = require('idgen')
  , rimraf = require('rimraf')

describe('fs', function () {
  var p = '/tmp/kafs-test-' + idgen()
    , fs
    , testFile = JSON.stringify(require('./fixtures/obj.json'), null, 2)

  after(function (done) {
    if (process.env.DEBUG) return done();
    rimraf(p, function (err) {
      done(err);
    });
  });

  it('init data', function (done) {
    kafs.volume.init(kafs.path.join(p, 'data'), function (err, vol) {
      assert.ifError(err);
      assert(vol.created > 1397612079059);
      assert.strictEqual(vol.id.length, 16);
      assert(!vol.pubkey);
      assert(!vol.fingerprint);
      assert.strictEqual(vol.depth, 3);
      done();
    });
  });

  it('load data', function (done) {
    kafs.load(kafs.path.join(p, 'data'), function (err, vol) {
      assert.ifError(err);
      fs = kafs.fs.emulate(vol);
      done();
    });
  });

  it('exists', function (done) {
    fs.exists('does/not/exist', function (exists) {
      assert(!exists);
      assert(!fs.existsSync('does/not/exist'));
      done();
    });
  });

  it('writeFile', function (done) {
    fs.writeFile('does/exist.json', testFile, testFile, function (err) {
      assert.ifError(err);
      done();
    });
  });

  it('exists', function (done) {
    fs.exists('does/exist.json', function (exists) {
      assert(exists);
      assert(fs.existsSync('does/exist.json'));
      done();
    });
  });

  it('readFile', function (done) {
    fs.readFile('does/exist.json', function (err, data) {
      assert.ifError(err);
      assert(Buffer.isBuffer(data));
      assert.equal(data.toString(), testFile);
      done();
    });
  });

  it('readFile with encoding', function (done) {
    fs.readFile('does/exist.json', {encoding: 'utf8'}, function (err, data) {
      assert.ifError(err);
      assert(!Buffer.isBuffer(data));
      assert.equal(data, testFile);
      done();
    });
  });

  it('createReadStream', function (done) {
    var stream = fs.createReadStream('does/exist.json');
    var chunks = [];
    stream.on('data', function (data) {
      assert(Buffer.isBuffer(data));
      chunks.push(data);
    });
    stream.on('end', function () {
      assert.equal(Buffer.concat(chunks).toString(), testFile);
      done();
    });
  });

  it('createReadStream with encoding', function (done) {
    var stream = fs.createReadStream('does/exist.json', {encoding: 'utf8'});
    var chunks = [];
    stream.on('data', function (data) {
      assert(typeof data === 'string');
      chunks.push(data);
    });
    stream.on('end', function () {
      assert.equal(chunks.join(''), testFile);
      done();
    });
  });
});
