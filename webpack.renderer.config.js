const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: 'development',
  entry: './src/renderer/renderer.js',
  output: {
    path: path.resolve(__dirname, '.webpack', 'renderer'),
    filename: 'renderer.js',
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
          },
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      filename: 'index.html',
      template: './src/html/index.html',
    }),
  ],
  target: 'electron-renderer',
  externals: {
    'fluent-ffmpeg': 'commonjs fluent-ffmpeg'
  }
};