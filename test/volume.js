var idgen = require('idgen')
  , rimraf = require('rimraf')

describe('vol', function () {
  var p = '/tmp/kafs-test-' + idgen(), volume;
  after(function (done) {
    rimraf(p, function (err) {
      done(err);
    });
  });

  it('init', function (done) {
    kafs.volume.init(p, function (err, vol) {
      assert.ifError(err);
      assert(vol.created > 1397612079059);
      assert.strictEqual(vol.id.length, 16);
      assert(vol.pubkey.match(/^ssh-rsa /));
      assert(vol.fingerprint.match(/^2048 /));
      assert.strictEqual(vol.depth, 3);
      assert.strictEqual(vol.clock, 0);
      done();
    });
  });

  it('read', function (done) {
    kafs.load(p, function (err, vol) {
      assert.ifError(err);
      assert(vol.created > 1397612079059);
      volume = vol;
      done();
    });
  });

  it('write', function (done) {
    done();
  });

  it('read message', function (done) {
    done();
  });
});