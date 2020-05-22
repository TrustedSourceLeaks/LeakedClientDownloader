const childProcess = require('child_process');
const upx = require('upx')('best')
const { compile } = require('nexe');


console.log("MAKING BUILD");
compile({
  input: 'index.js',
  output: 'bin/EFT-Downloader-Uncompressed',
  build: false,
  target: '12.15.0',
  ico: 'build/res/icon.ico'
}).then(function (err) {

  console.log("CHANGING ICON");
  childProcess.execFile('build/bin/ResourceHacker.exe', [
    '-open',
    'bin/EFT-Downloader-Uncompressed.exe',
    '-save',
    'bin/EFT-Downloader-Uncompressed.exe',
    '-action',
    'addoverwrite',
    '-res',
    'build/res/icon.ico',
    '-mask',
    'ICONGROUP,MAINICON'
  ], function (err) {

    console.log("COMPRESSING EXE");
    upx('bin/EFT-Downloader-Uncompressed.exe').output('bin/EFT-Downloader.exe')
      .start().then(function (stats) {
        console.log(stats);
      }).catch(function (err) {
        console.log(err);
      });
  });
});
