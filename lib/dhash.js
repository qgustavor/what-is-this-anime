var PNG = require('png-js'),DEFAULT_HASH_SIZE = 8,
    PIXEL_LENGTH = 4;

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
  (new PNG(buffer)).decode(function(err, pixels) {
    if (err) {
      callback && callback(err, false);
    } else {
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
    }
  });
};

module.exports.stream = module.exports;