describe('basic test', function () {
  it('works', function () {
    var kafs = require('../')({
      cipher: 'aes-256-cbc',
      password: 'm0ckingbird'
    });
  });
});