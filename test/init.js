var idgen = require('idgen')
  , rimraf = require('rimraf')

describe('init', function () {
  var p = '/tmp/kafs-test-' + idgen();
  after(function (done) {
    rimraf(p, function (err) {
      done(err);
    });
  });

  it('inits', function (done) {
    kafs.init(p, function (err, manifest) {
      assert.ifError(err);
      assert(manifest.created > 1397612079059);
      assert.strictEqual(manifest.id.length, 16);
      assert(manifest.pubkey.match(/^ssh-rsa /));
      assert(manifest.fingerprint.match(/^2048 /));
      assert.strictEqual(manifest.depth, 3);
      assert.strictEqual(manifest.clock, 0);
      done();
    });
  });
});