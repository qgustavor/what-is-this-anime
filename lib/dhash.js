const PNG = require('png-js');
const DEFAULT_HASH_SIZE = 8;
const PIXEL_LENGTH = 4;

function px(pixels, width, x, y) {
  return pixels[width * PIXEL_LENGTH * y + x * PIXEL_LENGTH];
}

function binaryToHex(s) {
  for (var i = 0, output = ''; i < s.length; i += 4) {
    output += parseInt(s.substr(i, 4), 2).toString(16);
  }
  return output;
}

module.exports = function(buffer, callback) {
  try {
    new PNG(buffer).decode(function(pixels) {
      if(pixels.length !== 288) {
        throw new Error('pixels.length is ' + pixels.length + ', expected 288 (9 * 8 * 4).');
      }
      // Compare adjacent pixels.
      var difference = '';
      for (var row = 0; row < 8; row++) {
        for (var col = 0; col < 8; col++) { // height is not a mistake here...
          difference += +(px(pixels, 9, col, row) < px(pixels, 9, col + 1, row));
        }
      }
      
      // Convert difference to hex string
      callback && callback(false, binaryToHex(difference));
    });
  } catch (err) {
    callback && callback(err, false);
  }
};

module.exports.stream = module.exports;
