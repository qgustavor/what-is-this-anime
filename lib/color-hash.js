var PNG = require('png-js');
var PIXEL_LENGTH = 4;

// The process can be reverted using this script:
// https://codepen.io/qgustavor/full/eNxpPQ/

function px256(pixels, x, y) {
  var r = pixels[2 * PIXEL_LENGTH * y + x * PIXEL_LENGTH    ] / 32 + 0.5;
  var g = pixels[2 * PIXEL_LENGTH * y + x * PIXEL_LENGTH + 1] / 32 + 0.5;
  var b = pixels[2 * PIXEL_LENGTH * y + x * PIXEL_LENGTH + 2] / 64 + 0.5;
  
  return (256 + ((r << 5) | (g << 2) | b)).toString(16).substr(1);
}

module.exports = function(buffer, callback) {
  (new PNG(buffer)).decode(function(err, pixels) {
    if (err) {
      callback && callback(err, false);
    } else {
      // Compare adjacent pixels.
      var result =
        px256(pixels, 0, 0) + px256(pixels, 0, 1) +
        px256(pixels, 1, 0) + px256(pixels, 1, 1);
      
      callback && callback(false, result);
    }
  });
};
