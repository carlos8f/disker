var idgen = require('idgen')
  , rimraf = require('rimraf')

describe('vol', function () {
  var p = '/tmp/kafs-test-' + idgen(), volume;
  after(function (done) {
    rimraf(p, function (err) {
      done(err);
    });
  });

  it('init keyring', function (done) {
    kafs.volume.init(kafs.path.join(p, 'keyring'), {keypair: true}, function (err, vol) {
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

  it('load keyring', function (done) {
    kafs.load(kafs.path.join(p, 'keyring'), function (err, vol) {
      assert.ifError(err);
      assert(vol.created > 1397612079059);
      volume = vol;
      done();
    });
  });

  it('init data', function (done) {
    kafs.volume.init(kafs.path.join(p, 'data'), {keyring: kafs.path.join(p, 'keyring')}, function (err, vol) {
      assert.ifError(err);
      assert(vol.created > 1397612079059);
      assert.strictEqual(vol.id.length, 16);
      assert(vol.id !== volume.id);
      assert(!vol.pubkey);
      assert(!vol.fingerprint);
      assert.strictEqual(vol.depth, 3);
      assert.strictEqual(vol.clock, 0);

      done();
    });
  });

  it('load data', function (done) {
    kafs.load(kafs.path.join(p, 'data'), {keyring: kafs.path.join(p, 'keyring')}, function (err, vol) {
      assert.ifError(err);
      assert.strictEqual(kafs.meta.stringify(vol.keyring), kafs.meta.stringify(volume));
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