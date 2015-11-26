# What is that anime?

A video and subtitle search tool inspired by anime.

## Installation:

As those tools were never intended to be released maybe installing can be a bit hard.

1. install Node, FFmpeg and (optional) SQLite, keep those available in PATH
2. `git clone https://github.com/qgustavor/what-is-that-anime.git`
3. `npm install`
4. edit config.js

## Usage:

### Video Indexer (process.js):

Populates the database with image hashes (based on [dhash](https://www.npmjs.com/package/dhash/)).

    node process
    
    -l --alternative Uses alternative method
    -m --mysql       Uses MySQL database
    -f --folder      Folder to search for videos
    
### Subtitle Indexer (subtitle-process.js):

Populates the database with anime images. Only supports MySQL databases.

    node subtitle-process
    
    -f --folder      Folder to search for videos
    
### Image Finder (find-image.js):

Finds an image in database.

    node find-mode [image-file] [threshold]
    
    -a --alternative Uses alternative method
    -m --mysql       Uses MySQL database
    -s --simple      Don't use thresholds, instead find exact results and exit
    -f --first       Exists on first result
    --no-partial     Don't try to find partial hashes
    
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
[in this MEGA folder](https://mega.nz/#F!X5t0DKhC) (key: `WhatIsThatAnime-DBDATA`).

## License:

[MIT License](https://github.com/qgustavor/what-is-that-anime/blob/master/LICENSE).
