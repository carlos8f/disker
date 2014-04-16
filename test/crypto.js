describe('crypto', function () {
  it('hashes', function () {
    var hash = kafs.crypto.hash('carlos');
    assert.equal(hash, 'e4UXW0VQYOMjfpJfAjBTypUV6Ggqg8iwmRHHJKH4t18');
    // the hash should be the base64url-encoded 256-bit sha.
    var compare = require('crypto').createHash('sha256').update('carlos').digest('hex');
    assert.strictEqual(Buffer(hash, 'base64').toString('hex'), compare);
  });
});