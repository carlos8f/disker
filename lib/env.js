var path = require('./path');

module.exports = exports = {
  detect: function () {
    if (!process.env.KAFS_KEYRING) process.env.KAFS_KEYRING = process.env.HOME
      ? path.join(process.env.HOME, '.kafs', '_keyring')
      : path.join(process.cwd(), '.kafs_keyring');

    if (!process.env.KAFS_VOLUME) process.env.KAFS_VOLUME = process.env.HOME
      ? path.join(process.env.HOME, '.kafs', 'default')
      : path.join(process.cwd(), '.kafs_volume');
  }
};
