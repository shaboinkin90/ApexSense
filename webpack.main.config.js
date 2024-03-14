const path = require('path');

module.exports = {

  mode: 'development',
  entry: './src/electron/main.js', // Adjust this path to your main process entry file
  target: 'electron-main',
  output: {
    filename: 'main.js', // The name of the output file
    path: path.join(__dirname, '.webpack', 'main')
  },
  module: {
    rules: [
    ],
  },
};
