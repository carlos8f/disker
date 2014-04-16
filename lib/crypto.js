var crypto = require('crypto')
  , idgen = require('idgen')

module.exports = {
  hash: function (data) {
    var sha = crypto.createHash('sha256').update(data).digest();
    return idgen(sha);
  }
};
