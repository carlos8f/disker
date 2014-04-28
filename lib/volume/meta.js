var path = require('path')
  , level = require('level')
  , modeler = require('modeler-leveldb')
  , stringify = require('json-stable-stringify')

module.exports = function () {
  var volume = this;
  var db = require('level')(path.join(volume.volPath));
  return {
    collection: function (p) {
      return modeler({
        db: db,
        name: 'meta',
        prefix: p ? path.dirname(p) : null
      });
    },
    create: function (data) {
      return this.collection().create(data);
    },
    read: function (p, cb) {
      var debug = require('debug')('kafs:meta:read');
      debug('read', p);
      this.collection(p).load(path.basename(p), cb);
    },
    write: function (p, data, cb) {
      var debug = require('debug')('kafs:meta:write');
      if (!p.match(/\.json$/)) p += '.json';
      debug('writing', p);
      debug('data', data);
      if (!data.id) data = this.create(data);
      this.collection(p).save(path.basename(p), data, cb);
    },
    destroy: function (p, cb) {
      this.collection(p).destroy(path.basename(p), cb);
    },
    stringify: function (data) {
      return stringify(data, {space: '  '});
    }
  };
};
