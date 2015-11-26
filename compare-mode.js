var spawn = require('child_process').spawn;
var hammingDistance = require('hamming-distance');
var colorHash = require('./lib/color-hash');
var dhash = require('./lib/dhash');
var config = require('./config');

var yargs = require('yargs')
		.boolean(['alternative'])
		.alias('a', 'alternative')
		.alias('histogram', 'alternative')
		.alias('h', 'alternative');
var argv = yargs.argv;

// 3fps = 3hz = www.3hz.co.jp
var FPS_CONST = argv.fps || 3;
var videoPath, imagePath;

var distance = argv.alternative ? alternativeDistance : hammingDistance;

// Clear screen:
// process.stdout.write('\u001b[2J\u001b[0;0H');
console.log('>> WITA? > What is that anime?');
console.log('> Image to video comparer');

if (argv._.length === 2) {
	videoPath = argv._[0];
	imagePath = argv._[1];
} else if (argv._.length === 1){
  videoPath = false;
  imagePath = argv._[0];
  console.log('It will return only the image\'s hash');
} else {
	console.log('\nUsage:');
	console.log('  node compare-mode [video-file] [image-file]');
	console.log('  -a --alternative Uses alternative method');
	process.exit();
}

// Always use ffmpeg to encode video and images to prevent problems with multiple resizing algorithms:
var ffmpegProcess = spawn('ffmpeg', argv.alternative ?
    [
		'-i', imagePath,
		'-vf', 'format=gray,scale=9x8',
		'-vsync', '0',
		'-f', 'image2pipe',
		'-vcodec', 'png',
		'pipe:1',
    '-i', imagePath,
		'-vf', 'scale=2x2',
		'-vsync', '0',
		'-f', 'image2pipe',
		'-vcodec', 'png',
		'pipe:3'] :
    [ '-i', imagePath,
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
        processVideo(videoPath, hash + colorHash);
      });
    } else {
      processVideo(videoPath, hash);
    }
	}, argv.alternative);
});

ffmpegProcess.on('close', function (exitCode) {
	if (exitCode !== 0) {
		console.log('Error', exitCode);
		console.log(errorLog);
	}
});

function processVideo(videoPath, targetHash) {
	var foundHashes = {};
	var processingEnded = 0;
	var frameCount = 0;
	var hashesFound = 0;
  
  if (videoPath === false) {
    processingEnded = 1;
    waitJobs();
    return;
  }
	
	var speed;
	var start = Date.now();
	var partialSpeed = 0;
	var speedInterval = setInterval(function () {
		speed = partialSpeed;
		partialSpeed = 0;
		process.stdout.write('\033[2K\033[0G> ' + frameCount + ' frames found ~ ' + speed + ' fps ');
	}, 1000);

	var ffmpegProcess = spawn('ffmpeg', argv.alternative ? [
		'-i', videoPath,
		'-vf', 'fps=fps=' + FPS_CONST + ',format=gray,scale=9x8',
		'-vsync', '0',
		'-f', 'image2pipe',
		'-vcodec', 'png',
		'pipe:1',
    
		'-i', videoPath,
		'-vf', 'fps=fps=' + FPS_CONST + ',scale=2x2',
		'-vsync', '0',
		'-f', 'image2pipe',
		'-vcodec', 'png',
		'pipe:3'] : [
		'-i', videoPath,
		'-vf', 'fps=fps=' + FPS_CONST + ',scale=9x8,format=gray',
		'-vsync', '0',
		'-f', 'image2pipe',
		'-vcodec', 'png',
		'pipe:1'], {
      stdio: argv.alternative ? ['pipe', 'pipe', 'pipe', 'pipe'] : null
    });
		
	var errorBuffer = '', duration;
	
	ffmpegProcess.stderr.setEncoding('utf-8');
	ffmpegProcess.stderr.on('data', function durationListener (data) {
		if (duration = data.match(/\d\d:\d\d:\d\d\.\d\d/)) {
			duration = duration[0].match(/\d+/g).reduce(function (t, e, n) {
				return t + parseInt(e) * [3600, 60, 1, 0.01][n];
			}, 0);
			ffmpegProcess.stderr.removeListener('data', durationListener);
		}
	});
	ffmpegProcess.stderr.on('data', function (data) {
		errorBuffer += data;
	});
	
  var lastHash;
  if (argv.alternative) {
    ffmpegProcess.stdout.on('data', function (data) {
      dhash.stream(data, function (err, frameHash) {
        if(!err) {
          lastHash = frameHash;
        }
      });
    });
    ffmpegProcess.stdio[3].on('data', function (data) {
      partialSpeed++; frameCount++;
      colorHash(data, function (err, colorHash) {
        if(!err) {
          foundHashes[lastHash + colorHash] = frameCount;
        }
      });
    });
	} else {
    ffmpegProcess.stdout.on('data', function (data) {
      partialSpeed++; frameCount++;
      dhash.stream(data, function (err, frameHash) {
        if(!err) {
          foundHashes[frameHash] = frameCount;
        }
      });
    });
  }
  
	ffmpegProcess.on('close', function(exitCode) {
		console.log('> Exit code: ' + exitCode);
		clearInterval(speedInterval);
		if (exitCode !== 0) {
			console.log(errorBuffer);
		}
		setTimeout(next, 100);
	});
	
	function next () {
		console.log('> Finalized', ((Date.now() - start) / 1000).toFixed(1), 'seconds');
		processingEnded++;
		waitJobs();
	}
	
	function waitJobs () {
		if (processingEnded !== 1) {
			return;
		}
		processingEnded++;
		
		console.log(targetHash.replace(/(.{8})(.{8})(.{8})?/, '$1 $2 $3'), '<-  target hash');
		console.log(Object.keys(foundHashes).map(function (e) {
			return [distance(targetHash, e), e];
		}).sort(function (a, b) {
			return a[0] - b[0];
		}).slice(0, 20).map(function (e) {
			return e[1].replace(/(.{8})(.{8})(.{8})?/, '$1 $2 $3') + ('   ' + e[0]).substr(-3) +
        ('                ' + toHMS(foundHashes[e[1]] * duration / frameCount)).substr(-13); //+ ', ' + FPS_CONST;
		}).join('\n'));
	}
}

function alternativeDistance(from, to) {
  var dhashFrom = from.substr(0, 16);
  var dhashTo = to.substr(0, 16);
  
  if (dhashFrom === dhashTo) {
    return hammingDistance(from.substr(16), to.substr(16));
  }
  
  return hammingDistance(dhashFrom, dhashTo);
}

function toHMS (seconds) {
	return ('00' + ((seconds % 3600) / 60 | 0)).substr(-2) + ':' +
				 ('00' + (seconds % 60).toFixed(3)).substr(-6);
}
