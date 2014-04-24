module.exports = function () {
  var debug = require('debug')('kafs:volume:toJSON');
  var ret = {}, volume = this;
  Object.keys(this).forEach(function (k) {
    if (k === 'keyring' || k === 'privateKey' || k === 'publicKey' || k === 'fs') return;
    ret[k] = volume[k];
  });
  return ret;
};
