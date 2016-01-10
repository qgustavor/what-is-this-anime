var spawn = require('child_process').spawn;
var assParser = require('ass-parser');
var mysql = require('mysql');
var path = require('path');
var glob = require('glob');
var config = require('./config');

var argv = require('yargs')
    .alias('f', 'folder')
    .argv;
    
var db = mysql.createConnection(config.mysqlConfig.subtitles);

var VIDEOS_BASE = argv.folder || config.defaultFolder;

db.query('CREATE TABLE IF NOT EXISTS videos (id INT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY, file VARCHAR(200), subtitles TEXT, FULLTEXT (subtitles))', function (err) {
  if (err) {throw err;}

console.log('>> WITA? > What is this anime?');
console.log('> Video to Database Processor');
console.log('> Subtitle extractor');

glob("*.@(mp4|avi|mkv)", {
  cwd: VIDEOS_BASE,
  matchBase: true
}, function (err, files) {
  var nextId = 1;
  var currentTask = 1;
  if (err) {throw err;}
  db.query('SELECT file FROM `videos`', function (err, data) {
    if (err) {throw err;}
    
    data = data.map(function(e) {return e['file'].replace(/\.(mp4|avi|mkv)$/, ''); });
    
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
        db.end();
        return;
      }
      var videoPath = path.join(VIDEOS_BASE, file);
      
      console.log('> ' + files.length + ' file' + (files.length === 1 ? '' : 's') + ' remaining ~ ' +
        ((filesTotal - files.length) * 100 / filesTotal | 0) + '% completed ~ ' + (filesTotal - files.length) + ' files processed\n');
        
      processVideo(videoPath, function (err, result) {
        if (!err && result){
          console.log('> ' + (file.length > 70 ? ('...' + file.substr(-67)) : file) + ' is being saved');
            
          db.query('INSERT INTO `videos` VALUES (?, ?, ?)', [null, path.basename(videoPath), result], function (err) {
            var delta = (currentTask - id) * 5 - 6;
            if (err) { throw err; }
            process.stdout.write('\033[' + delta + 'F\033[2K> ' +
                (file.length > 70 ? ('...' + file.substr(-67)) : file) +
                (err ? ' FAILED\033[' : ' was saved\033[') + delta + 'E');
          });
        } else {
          console.log('> ' + (file.length > 70 ? ('...' + file.substr(-67)) : file) + ' failed');
        }
        
        fileProcessLoop(id + 1);
      });
    }(nextId));
  });
});

});

function processVideo(videoPath, callback) {
  var start = Date.now();
  
  var ttyWidth = (process.stdout.isTTY ? process.stdout.columns : 100) - 13; // from 'processing'
  console.log(' Processing', videoPath.length > ttyWidth ? ('...' + videoPath.substr(-ttyWidth + 3)) : videoPath);
  
  var ffmpegProcess = spawn('ffmpeg', [
    '-i', videoPath,
    '-map', '0:s:0',
    '-scodec', 'copy',
    '-f', 'ass',
    'pipe:1']);
    
  var result = '';
  var frameCount = 0;
  var errorBuffer = '';
  
  ffmpegProcess.stderr.setEncoding('utf-8');
  ffmpegProcess.stderr.on('data', function (data) {
    errorBuffer += data;
  });
  
  ffmpegProcess.stdout.setEncoding('utf-8');
  ffmpegProcess.stdout.on('data', function (data) {
    result += data;
    frameCount++;
    process.stdout.write('\033[2K\033[0G> ' + frameCount + ' lines found ');
  });
  
  ffmpegProcess.on('close', function(exitCode) {
    if (exitCode !== 0) {
      process.stdout.write('> FAILED: exit code ' + exitCode + ' ');
    }
    console.log('> Finalized after', ((Date.now() - start) / 1000).toFixed(1), 'seconds');
    
    if (exitCode !== 0) {
      callback(errorBuffer);
    } else {
      // Parse ASS:
      var parsed = assParser(result);
      var fullText = [];
      parsed.forEach(function (part) {
        if (part.section === 'Events') {
          part.body.forEach(function (line) {
            if (line.key === 'Dialogue') {
              if (
                line.value.Text.indexOf('}m ') === -1 && // Filter polygons
                line.value.Text.indexOf('{\\p') === -1 && // Filter polygons
                line.value.Text.length > 1 // Minimum length
              ) {
                fullText.push(line.value.Text
                  .replace(/{[^}]+}/g, '')
                  .replace(/\\N/g, ' ')
                  .replace(/\s+/g, ' ')
                );
              }
            }
          });
        }
      });
    
      callback(null, fullText.join('\n'));
    }
  });
}
