# What is this anime?

A video and subtitle search tool inspired by anime.

## Installation:

As those tools were never intended to be released maybe installing can be a bit hard.

1. install Node, FFmpeg and (optional) SQLite, keep those available in PATH
2. `git clone https://github.com/qgustavor/what-is-this-anime.git`
3. `npm install`
4. edit config.js
5. run `node process` to index files in your computer
6. run `node find-image [image path]` to find a image

If you think those steps are too hard I recommend using [this website](https://whatanime.ga/) (not by me)
which also allows searching anime by image, is simple to use and a lot faster than the scripts on this
repository.

## Usage:

### Video Indexer (process.js):

Populates the database with image hashes (based on [dhash](https://www.npmjs.com/package/dhash/)).
Indexing can be automated by calling this script in cron, task scheduler or similar.

    node process
    
    -l --alternative Uses alternative method
    -m --mysql       Uses MySQL database
    -f --folder      Folder to search for videos
    
### Subtitle Indexer (subtitle-process.js):

Populates the database with subtitle lines. Only supports MySQL databases. Note that there
isn't no "Subtitle Finder" script, but a simple SQL select can be used for that.

    node subtitle-process
    
    -f --folder      Folder to search for videos
    
### Image Finder (find-image.js):

Finds an image in database.

    node find-image [image-file] [threshold]
    
    -a --alternative Uses alternative method
    -m --mysql       Uses MySQL database
    -s --simple      Don't use thresholds, instead find exact results and exit
    -f --first       Exits on first result
    --no-partial     Don't try to find partial hashes
    
Output format (for alternative method):

    First line: image info
    >> 12345678 12345678 12345678 <- target hash
    The first two are the dhash, the third is the color information

    Subsequent lines: result info:
    >> 12345678  2 Sintel.mkv
    >> 12345678  3 Big Buck Bunny.mkv
    The first number is the color information, then the hamming distance, then the file name.
    
The output format for the old (and still default, to not break compatibility) method is
almost the same, but without color information for the image and results.
    
You can compare color information between image and results by entering color values in
[this tool](https://codepen.io/qgustavor/full/eNxpPQ) (use 0x prefix, as those numbers
are encoded in hexadecimal; example: if the script returns `12345678` then use `0x12345678`).
    
### Video to image comparer (compare-mode.js):

Finds an image in a specific video.

    node compare-mode [video-file] [image-file]
    
    -a --alternative Uses alternative method
    
## What the "alternative" method is:

The alternative method, beside the bad naming, is an improved method of indexing.
It uses the concatenation of the dhash, to store shape information, and four colors
from the image encoded in 8bit, for color information.
  
## Database dumps:

There are database dumps for MySQL (images and subtitles) and SQLite (images, old schema)
[in this MEGA folder](https://mega.nz/#F!O0UgGY4I) (key: `WhatIsThisAnime-DBDATA`).

## License:

[MIT License](https://github.com/qgustavor/what-is-this-anime/blob/master/LICENSE).
I'm not a lawyer, if there are problems using this license just open a issue pointing that.
