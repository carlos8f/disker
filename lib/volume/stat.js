var meta = require('../meta')
  , crypto = require('crypto')

module.exports = function (p, cb) {
  var volume = this, keyring = this.keyring;
  var debug = require('debug')('kafs:volume:stat');
  debug('stat', volume.id, p);
  volume.meta.read(p, function (err, stat) {
    debug('stat?', stat);
    if (err) return cb(err);
    if (stat._protected && stat.key && stat.cipher && keyring) {
      debug('getting key', stat.key);
      keyring.crypto.getKey(stat.key, function (err, key) {
        if (err) return cb(err);
        var decipher = crypto.createDecipher(stat.cipher, key.password);
        try {
          debug('deciphering stat');
          var _protected = decipher.update(stat._protected, 'base64', 'utf8');
          _protected += decipher.final('utf8');
          debug('_protected', _protected);
          _protected = JSON.parse(_protected);
          cb(null, _protected);
        }
        catch (e) {
          debug('e', e);
          cb(e);
        }
      });
    }
    else cb(null, stat);
  });
};
