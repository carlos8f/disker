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
});
