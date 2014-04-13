describe('basic test', function () {
  it('works', function () {
    var disker = require('../')({
      gzip: true,
      gunzip: true,
      cipher: 'aes-256-cbc',
      password: 'm0ckingbird'
    });
    console.log(disker.makePath('README.txt'));
  });
});