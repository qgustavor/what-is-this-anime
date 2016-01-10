var path = require('path');

module.exports = {
  // Default folder when searching images
  defaultFolder: '\\Animes',
  
  // Maximum relation between number of failed frames and the total
  skipLimit: 0.01,
  
  // Maximum value allowed for the relation above for a retry
  fixableLimit: 0.5,
  
  // MySQL database config:
  mysqlConfig: {
    normal: {
      user: 'wita-process',
      password: 'wita-process',
      database: 'wita'
    },
    legacy: {
      user: 'wita-process',
      password: 'wita-process',
      database: 'wita-legacy'
    },
    subtitles: {
      user: 'wita-process',
      password: 'wita-process',
      database: 'wita-subtitles'
    }
  },
  
  // SQLite config:
  sqliteConfig: {
    normal: path.join(__dirname, 'histogram.sqlite'),
    legacy: path.join(__dirname, 'database.sqlite')
  },
  
  // Blacklisted files:
  blacklist: []
};
