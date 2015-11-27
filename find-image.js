var distance = require('hamming-distance');
var spawn = require('child_process').spawn;
var dblite = require('dblite');
var colorHash = require('./lib/color-hash');
var dhash = require('./lib/dhash');
var mysql = require('mysql');
var path = require('path');
var fs = require('fs');
var config = require('./config');

var argv = require('yargs')
    .boolean(['alternative', 'first', 'simple', 'partial', 'mysql'])
    .alias('f', 'first')
    .alias('a', 'alternative')
    .alias('histogram', 'alternative')
    .alias('h', 'alternative')
    .alias('s', 'simple')
    .alias('m', 'mysql')
    .default('partial', true)
    .argv;

var db, dbPath;
var found = false;

if (argv.mysql) {
  db = mysql.createConnection(
    argv.alternative ?
    config.mysqlConfig.normal :
    config.mysqlConfig.legacy
  );
} else {
  if (argv.db) {
    dbPath = argv.db;
  } else if (argv.alternative) {
    dbPath = config.sqliteConfig.normal;
  } else {
    dbPath = config.sqliteConfig.legacy;
  }
  db = dblite(dbPath);
}
  
// Clear screen:
// process.stdout.write('\u001b[2J\u001b[0;0H');
console.log('>> WITA? > What is this anime?');
console.log('> Image hash finder');

var image = argv._[0];
var limit = argv._[1] || (argv.mysql ? 12 : 4);
var loopLength = 1000;

if (!image) {
  console.log('Input an image');
  process.exit();
}

if (!argv.mysql) {
  // Build filenames cache:
  db.query('SELECT * FROM videos', function(err, data) {
    printNamesCache = {
      list: data,
      ids: data.map(function (e) {
        return e[0];
      })
    };
  });
}

var ffmpegProcess = spawn('ffmpeg', argv.alternative ?
    [
    '-i', image,
    '-vf', 'format=gray,scale=9x8',
    '-vsync', '0',
    '-f', 'image2pipe',
    '-vcodec', 'png',
    'pipe:1',
    '-i', image,
    '-vf', 'scale=2x2',
    '-vsync', '0',
    '-f', 'image2pipe',
    '-vcodec', 'png',
    'pipe:3'] :
    [ '-i', image,
    '-vf', 'scale=9x8,format=gray',
    '-vsync', '0',
    '-f', 'image2pipe',
    '-vcodec', 'png',
    'pipe:1'], {
      stdio: argv.alternative ? ['pipe', 'pipe', 'pipe', 'pipe'] : null
    }),
    errorLog = '';
    
ffmpegProcess.stderr.setEncoding('utf-8');
ffmpegProcess.stderr.on('data', function (err) {
  errorLog += err;
});

var alternatePromise;
if (argv.alternative) {
  alternatePromise = new Promise(function(resolve) {
    ffmpegProcess.stdio[3].on('data', function(image) {
      colorHash(image, function (err, result) {
        if (err) {
          throw err;
        }
        resolve(result);
      });
    });
  });
}

ffmpegProcess.stdout.on('data', function (image) {
  dhash.stream(image, function (err, hash) {
    if (err) throw err;
    
    if (argv.alternative) {
      alternatePromise.then(function(colorHash){
        handleImageHash(hash + colorHash);
      });
    } else {
      handleImageHash(hash);
    }
  }, argv.alternative);
});

ffmpegProcess.on('close', function (exitCode) {
  if (exitCode !== 0) {
    console.log('Error', exitCode);
    console.log(errorLog);
  }
});

function handleImageHash(hash) {
  console.log(hash.replace(/(.{8})(.{8})(.{8})?/, '$1 $2 $3'), '<- target hash');
  
  if (argv.mysql) {
    findUsingMySQL(hash);
    return;
  }
  
  var mid = argv.alternative ? 8 : 6;
  if (!argv.partial) {
    queryLoop(hash, 0);
    return;
  }
    
  db.query(
    'SELECT * FROM hashes WHERE hash1=? OR hash2=?' + (argv.alternative ? ' OR hash3=?' : ''),
    [ parseInt(hash.substr(0, mid), 16), parseInt(hash.substr(mid, mid), 16) ]
    .concat(argv.alternative ? parseInt(hash.substr(2 * mid, mid), 16) : []),
    function (err, data) {
    if (err) {throw err;}
    
    if (data.length) {
      console.log('\n> Partial matches:');
      processData(hash, data);
    }
    
    if (argv.simple) {
      db.close();
      process.exit(+!found);
      return;
    }
    
    console.log('\n> Threshold based search (using', limit, 'as threshold):');
    queryLoop(hash, 0);
  });
}

function findUsingMySQL(hash) {
  var initTime = Date.now();
  var query = db.query('SELECT ' + (argv.alternative ? 'hex(hash3),' : '') + ' distance, file FROM `videos`\n' +
    'JOIN (\n' +
      'SELECT video, distance' + (argv.alternative ? ', hash3' : '') + '\n' +
      'FROM (\n' +
        'SELECT video' + (argv.alternative ? ', hash3' : '') + ', (BIT_COUNT(hash1 ^ ?) + BIT_COUNT(hash2 ^ ?)) as distance\n' +
        'FROM `hashes`\n' +
        // 'LIMIT 100\n' + // for testing
      ') as sub\n' +
      'WHERE distance < ?\n' +
    ') as result\n' +
    'WHERE videoid = result.video\n' +
    'ORDER BY distance ASC\n' + // even if it gets disabled it will not stream
    'LIMIT 100;',
    [parseInt(hash.substr(0, 8), 16), parseInt(hash.substr(8, 8), 16), limit]);
  
  query.on('result', processRowResult);
  query.on('end', function () {
    console.log('Query finished in %s seconds', ((Date.now() - initTime) / 1000).toFixed(1))
    db.end(function () {
      process.exit(+!found);
    });
  });
}

function processRowResult(result) {
  found = true;
  console.log(
    argv.alternative ? (('00000000' + result['hex(hash3)']).substr(-8)) : '',
    ('  ' + result['distance']).substr(-2),
    result['file']
  );
}

function queryLoop (hash, offset) {
  if (offset !== 0 && offset % 1e6 === 0) {
    console.log('Processed', offset, 'hashes');
  }
  db.query('SELECT * FROM hashes LIMIT ? OFFSET ?', [loopLength, offset], function (err, data) {
    setImmediate(processData, hash, data);
    if (data.length === loopLength) {
      setImmediate(queryLoop, hash, offset + loopLength);
    } else {
      db.close(function () {
        console.log('Done');
        process.exit(+!found);
      });
    }
  });
}

function processData (hash, data) {
  var filtered = data.map(compareRow(hash)).filter(function (e) {
    return e[0] < limit;
  });
  
  printNames(filtered);
}

function compareRow(hash) {
  if (argv.alternative) {
    return function (row) {
      var rowHash = ('000000' + parseInt(row[0], 10).toString(16)).substr(-6) +
                    ('000000' + parseInt(row[1], 10).toString(16)).substr(-6) +
                    ('000000' + parseInt(row[2], 10).toString(16)).substr(-6);
      return [distance(hash, rowHash), rowHash, row[3]];
    };
  }
  return function (row) {
    var rowHash = ('00000000' + parseInt(row[0], 10).toString(16)).substr(-8) +
                  ('00000000' + parseInt(row[1], 10).toString(16)).substr(-8);
    return [distance(hash, rowHash), rowHash, row[2]];
  };
}

var printNamesCache = null;
function printNames(rows) { // distance, hash, id
  var output = rows.map(function (e){
    var id = printNamesCache.ids.indexOf(e[2]);
    return e[1] + ('   ' + e[0]).substr(-3) + ('     ' + id).substr(-5) + ' ' + printNamesCache.list[id][1];
  });
  
  if (output.length) {
    found = true;
    console.log(output.join('\n'));
    if (argv.first) {
      process.exit(0);
    }
  } 
}