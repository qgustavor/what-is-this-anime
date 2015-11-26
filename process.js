var spawn = require('child_process').spawn;
var colorHash = require('./lib/color-hash');
var dhash = require('./lib/dhash');
var dblite = require('dblite');
var mysql = require('mysql');
var path = require('path');
var glob = require('glob');
var config = require('./config');

var argv = require('yargs')
    .boolean(['alternative', 'mysql', 'forceExit'])
    .default('forceExit', true) // disable with --no-force-exit
    .default('limit', config.skipLimit)
    .default('fixableLimit', config.fixableLimit)
    .alias('l', 'limit')
    .alias('a', 'alternative')
    .alias('f', 'folder')
    .alias('m', 'mysql')
    .argv;
    
var VIDEOS_BASE = argv.folder || config.defaultFolder;

var dbPath, db;
var videoIdKey, fileKey;
var alternateInsertQuery;
var transationStartQuery;
var savingState = 0;

if (argv.mysql) {
  videoIdKey = 'videoid'; fileKey = 'file';
  transationStartQuery = 'START TRANSACTION';
  alternateInsertQuery = 'INSERT IGNORE INTO `hashes` VALUES (?, ?, ?, ?)';
  legacyInsertQuery = 'INSERT IGNORE INTO `hashes` VALUES (?, ?, ?)';
  
  db = mysql.createConnection(
    argv.alternative ?
    config.mysqlConfig.normal :
    config.mysqlConfig.legacy
  );
} else {
  videoIdKey = 0; fileKey = 1;
  transationStartQuery = 'BEGIN TRANSACTION';
  alternateInsertQuery = 'INSERT OR IGNORE INTO `hashes` VALUES (?, ?, ?, ?)';
  legacyInsertQuery = 'INSERT OR IGNORE INTO `hashes` VALUES (?, ?, ?)';
  
  if (argv.db) {
    dbPath = argv.db;
  } else if (argv.alternative) {
    dbPath = config.sqliteConfig.normal;
  } else {
    dbPath = config.sqliteConfig.legacy;
  }

  db = dblite(dbPath);
}

db.query(argv.alternative ?
  'CREATE TABLE IF NOT EXISTS hashes (hash1 INTEGER UNSIGNED, hash2 INTEGER UNSIGNED, hash3 INTEGER UNSIGNED, video INTEGER UNSIGNED, PRIMARY KEY (hash1, hash2, hash3))' :
  'CREATE TABLE IF NOT EXISTS hashes (hash1 INTEGER UNSIGNED, hash2 INTEGER UNSIGNED, video INTEGER UNSIGNED, PRIMARY KEY (hash1, hash2))'
  , function (err) {
  if (err) {throw err;}
  
db.query('CREATE TABLE IF NOT EXISTS videos (videoid INTEGER UNSIGNED PRIMARY KEY, file TEXT)', function () {

// Clear screen:
// process.stdout.write('\u001b[2J\u001b[0;0H');
console.log('>> WITA? > What is that anime?');
console.log('> Video to Database Processor');

glob('*.@(mp4|avi|mkv)', {
  cwd: VIDEOS_BASE,
  matchBase: true
}, function (err, files) {
  var nextId = 1;
  var currentTask = 1;
  if (err) {throw err;}
  db.query('SELECT * FROM `videos`', function (err, data) {
    if (err) {throw err;}
    
    if (data.length) {
      currentTask = nextId = 1 + (+data.sort(function (a, b) {
        return +b[videoIdKey] - +a[videoIdKey];
      })[0][videoIdKey]);
    }
    
    data = data.map(function(e) {return e[fileKey].replace(/\.(mp4|avi|mkv)$/, ''); });
    
    var filesTotal = files.length;
    
    files = files.filter(function (e) {
      return -1 === data.indexOf(path.basename(path.join(VIDEOS_BASE, e)).replace(/\.(mp4|avi|mkv)$/, '')) &&
        config.blacklist.reduce(function (result, element) {
          return result && -1 === e.indexOf(element);
        }, true);
    });
    
    var currentIndex = files.length, temporaryValue, randomIndex;

    // Shuffle elements in order to keep database even:
    while (0 !== currentIndex) {
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex -= 1;

      temporaryValue = files[currentIndex];
      files[currentIndex] = files[randomIndex];
      files[randomIndex] = temporaryValue;
    }
    
    (function fileProcessLoop(id) {
      var file = files.shift();
      currentTask++;
      
      if (!file) {
        console.log('All files processed.');
        
        // Give some time to all processes to end
        // Use .unref() to fast exit when possible
        setTimeout(function tryCloseDb(i) {
          if (argv.forceExit ? savingState > i / 6 : savingState > 0) {
            setTimeout(tryCloseDb, 30e3, i + 1).unref();
          } else if (argv.mysql) {
            db.end();
          } else {
            db.close();
            
            // SQLite module is buggy,
            // so force process to exit:
            setTimeout(function () {
              process.exit();
            }, 120e3).unref();
          }
        }, 30e3, 0).unref();
        return;
      }
      var videoPath = path.join(VIDEOS_BASE, file);
      savingState++;
      
      console.log('> ' + files.length + ' file' + (files.length === 1 ? '' : 's') + ' remaining ~ ' +
        ((filesTotal - files.length) * 100 / filesTotal | 0) + '% completed ~ ' + (filesTotal - files.length) + ' files processed\n');
      processVideo(videoPath, function (err, hashes) {
        if (!err && hashes && hashes.length){
          console.log('> ' + (file.length > 70 ? ('...' + file.substr(-67)) : file) + ' is being saved');
          (function insertLoop() {
            var queryTimeout, timeoutCount = 0;
            if (!argv.mysql) {
              queryTimeout = setInterval(function () {
                if (++timeoutCount >= 10) {
                  process.stdout.write('\033[4F\033[2K> ' + (file.length > 70 ? ('...' + file.substr(-67)) : file) + ' is retrying\033[4E');
                  clearInterval(queryTimeout);
                  insertLoop();
                } else {
                  process.stdout.write('\033[4F\033[2K> ' + (file.length > 70 ? ('...' + file.substr(-67)) : file) + ' is still saving\033[4E');
                }
              }, 10e3);
            }
            
            db.query(transationStartQuery);
              
            if (argv.mysql) {
              db.query('INSERT INTO `videos` VALUES (?, ?)', [id, path.basename(videoPath)], afterVideoInserted);
            } else {
              // Match old method on SQLite:
              db.query('INSERT INTO `videos` VALUES (?, ?)', [id, path.basename(videoPath)]);
              afterVideoInserted();
            }
            
            function afterVideoInserted(err) {
              if (err) {
                console.log('Got error', err);
                return;
              }
              var skipped = 0;
              hashes.forEach(function (e) {
                if (argv.alternative) {
                  if (e.length !== 24) {skipped++; return;}
                  db.query(alternateInsertQuery, [
                    parseInt(e.substr( 0, 8), 16),
                    parseInt(e.substr( 8, 8), 16),
                    parseInt(e.substr(16, 8), 16),
                    id
                  ], checkHashError);
                } else {
                  if (e.length !== 16) {skipped++; return;}
                  db.query(legacyInsertQuery, [
                    parseInt(e.substr(0, 8), 16),
                    parseInt(e.substr(8, 8), 16),
                    id
                  ], checkHashError);
                }
                
                function checkHashError(err) {
                  if (err) {
                    console.log('Error in (%s) with the hash (%s)', videoPath, e);
                    throw err;
                  }
                }
              });              
              
              if (skipped > hashes.length * argv.limit) { // Allow an limit to be skipped
                db.query('ROLLBACK', function () {
                  var delta = (currentTask - id) * 5 - 6;
                  process.stdout.write('\033[' + delta + 'F\033[2K> ' +
                    (file.length > 70 ? ('...' + file.substr(-67)) : file) +
                    ' FAILED: skipped ' + skipped + ' hashes\033[' + delta + 'E');
                  clearInterval(queryTimeout);
                  savingState--;
                });
                
                // For a fixable limit add to the end of the queue:
                if (skipped < hashes.length * argv.fixableLimit) {
                  files.push(file);
                }
              } else {
                db.query('COMMIT', function () {
                  var delta = (currentTask - id) * 5 - 6;
                  process.stdout.write('\033[' + delta + 'F\033[2K> ' +
                    (file.length > 70 ? ('...' + file.substr(-67)) : file) +
                    ' was saved\033[' + delta + 'E');
                  clearInterval(queryTimeout);
                  savingState--;
                });
              }
            }
          }());
        } else {
          console.log('> ' + (file.length > 70 ? ('...' + file.substr(-67)) : file) + ' failed');
        }
        
        fileProcessLoop(id + 1);
      });
    }(nextId));
  });
});

}); });

function processVideo (videoPath, callback) {
  var foundHashes = [];
  var processingEnded = 0;
  var frameCount = 0;
  var hashesFound = 0;
  
  var start = Date.now();
  var speed = '?';
  var partialSpeed = 0;
  var showSpeedStat = function () {
    frameCount += (speed = partialSpeed);
    partialSpeed = 0;
    process.stdout.write('\033[2K\033[0G> ' + frameCount + ' frames found ~ ' + speed + ' fps ');
  };
  var speedInterval = setInterval(showSpeedStat, 1000);
  
  var ttyWidth = (process.stdout.isTTY ? process.stdout.columns : 100) - 13; // from 'processing'
  console.log(' Processing', videoPath.length > ttyWidth ? ('...' + videoPath.substr(-ttyWidth + 3)) : videoPath);
  showSpeedStat();
  
  var ffmpegProcess = spawn('ffmpeg', argv.alternative ? [
    '-i', videoPath,
    '-vf', 'fps=fps=3,format=gray,scale=9x8',
    '-vsync', '0',
    '-f', 'image2pipe',
    '-vcodec', 'png',
    'pipe:1',
    
    '-i', videoPath, // 3fps = 3hz = www.3hz.co.jp
    '-vf', 'fps=fps=3,scale=2x2',
    '-vsync', '0',
    '-f', 'image2pipe',
    '-vcodec', 'png',
    'pipe:3'] : [
    '-i', videoPath,
    '-vf', 'fps=fps=3,scale=9x8,format=gray',
    '-vsync', '0',
    '-f', 'image2pipe',
    '-vcodec', 'png',
    'pipe:1'], {
      stdio: argv.alternative ? ['pipe', 'pipe', 'pipe', 'pipe'] : null
    });
    
  var errorBuffer = '';
  
  ffmpegProcess.stderr.setEncoding('utf-8');
  ffmpegProcess.stderr.on('data', function (data) {
    errorBuffer += data;
  });
  
  if (argv.alternative) {
    var dhashIndex = 0;
    ffmpegProcess.stdout.on('data', function (data) {
      dhash.stream(data, function (err, frameHash) {
        if(!err) {
          foundHashes[dhashIndex] = frameHash + (foundHashes[dhashIndex] || '');
          dhashIndex++;
        }
      });
    });
    
    var colorIndex = 0;
    ffmpegProcess.stdio[3].on('data', function (data) {
      partialSpeed++;
      colorHash(data, function (err, colorHash) {
        if(!err) {
          foundHashes[colorIndex] = (foundHashes[colorIndex] || '') + colorHash;
          colorIndex++;
        }
      });
    });
  } else {
    ffmpegProcess.stdout.on('data', function (data) {
      partialSpeed++;
      dhash.stream(data, function (err, frameHash) {
        if(!err) {
          foundHashes.push(frameHash);
        }
      });
    });
  }
  
  ffmpegProcess.on('close', function(exitCode) {
    clearInterval(speedInterval);
    if (exitCode !== 0) {
      process.stdout.write('> FAILED: exit code ' + exitCode + /* '\n' + errorBuffer + */ ' ');
    }
    console.log('> Finalized after', ((Date.now() - start) / 1000).toFixed(1), 'seconds');
    process.stdout.write('\033[1F'); // Avoid line mismatch
    setTimeout(next, exitCode !== 0 ? 0 : 10e3);
  });
  
  function next () {
    if (processingEnded !== 0) {
      return;
    }
    processingEnded++;
    
    foundHashes = foundHashes.filter(function (e, n, a) {
      return n === a.indexOf(e);
    });
    
    process.stdout.write('\033[1E'); // Avoid line mismatch
    setImmediate(callback, null, foundHashes);
  }
}