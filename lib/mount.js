var saw = require('saw')
  , fs = require('./fs')
  , path = require('./path')

module.exports = function (volume, path, opts) {
  opts || (opts = {});

  var s = saw(path)
    .on('all', function (ev, file) {
      switch (ev) {
        case 'add':
        case 'update':
          return compile(file);
        case 'remove':
          return remove(file);
      }
    })
    .once('ready', function (files) {
      // sync mount point to volume

    })
};
