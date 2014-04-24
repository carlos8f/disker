var hash = require('../lib/hash')
  , crypto = require('crypto')

describe('crypto', function () {
  it('hash', function () {
    var str = hash('carlos');
    assert.equal(str, 'e4UXW0VQYOMjfpJfAjBTypUV6Ggqg8iwmRHHJKH4t18');
    // the hash should be the base64url-encoded 256-bit sha.
    var compare = crypto.createHash('sha256').update('carlos').digest('hex');
    assert.strictEqual(Buffer(str, 'base64').toString('hex'), compare);
  });
  it('hash a stream', function (done) {
    var stream = hash.stream();
    var equal = false;
    stream.on('data', function (data) {
      assert.equal(data, 'e4UXW0VQYOMjfpJfAjBTypUV6Ggqg8iwmRHHJKH4t18');
      equal = true;
    });
    stream.on('end', function () {
      assert(equal);
      done();
    });
    setImmediate(function () {
      stream.write('ca');
      setImmediate(function () {
        stream.write('rlos');
        stream.end();
      });
    });
  });
  it('hash an object', function () {
    var obj = require('./fixtures/obj.json');
    var str = hash(obj);
    assert.equal(str, 'fQqAVeimbEISZVd57yngoKcWZPNw8_ldxUKD991DHqI');
  });
});