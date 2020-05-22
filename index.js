/* REQUIRES
-------------------------------------------------------------- */
const prompts = require('prompts');
const fs = require('fs-extra');
const zlib = require('zlib');
const axios = require('axios');
const path = require('path');
const conf = require('conf');

/* CONFIG
-------------------------------------------------------------- */
const config = new conf({ cwd: './' });

/* PROCESS
-------------------------------------------------------------- */
(async () => {
  try {

    // Check config
    if (!config.get('distrib')) {
      let ask = await prompts({
        type: 'text',
        name: 'result',
        initial: 'distribs',
        message: 'Where you want to download distrib files?',
      });
      config.set('distrib', ask.result);
    }

    if (!config.get('patch')) {
      let ask = await prompts({
        type: 'text',
        name: 'result',
        initial: 'patches',
        message: 'Where you want to download patch files?',
      });
      config.set('patch', ask.result);
    }

    // Get actual patches
    const patchlist = await axios({ url: 'https://launcher.escapefromtarkov.com/launcher/GetPatchList?launcherVersion=0&branch=live', method: 'GET', responseType: 'arraybuffer' }).then(res => zlib.inflateSync(res.data)).then(res => JSON.parse(res));
    if (patchlist.err) {
      throw new Error(patchlist.errmsg);
    }

    // Process patches to readable format
    const patches = patchlist.data.map(obj => {
      const splitted = obj.DownloadUri.split('/');
      return {
        type: 'patch',
        version: obj.FromVersion + '-' + obj.Version,
        file: splitted[5],
        path: splitted[4],
        url: obj.DownloadUri
      };
    });

    // Process distribs to readable format
    const distribs = patchlist.data.map(obj => {
      const splitted = obj.DownloadUri.split('/');
      return {
        type: 'distrib',
        version: obj.Version,
        file: splitted[5].replace(obj.FromVersion + '-', '').replace(obj.FromVersion + '-', '').replace('.update', '.zip'),
        path: splitted[4].replace(obj.FromVersion + '-', ''),
        url: obj.DownloadUri.replace('ClientUpdates', 'ClientDistribs').replace(obj.FromVersion + '-', '').replace(obj.FromVersion + '-', '').replace('.update', '.zip')
      };
    });

    // Process and sort list
    let list = distribs.concat(patches).sort((a, b) => (a.version < b.version) ? 1 : ((b.version < a.version) ? -1 : 0));

    // Save list for any purpose
    fs.writeJsonSync('list.json', list);

    // Prompt if no parameter
    if (config.get('silent', config.set('silent', config.get('silent', false))) == false) {
      // As user what he wants
      const response = await prompts({
        type: 'multiselect',
        name: 'versions',
        message: 'Pick version you want to download.',
        instructions: false,
        optionsPerPage: 20,
        choices: list.map((obj) => {
          return { title: obj.version, value: obj.version }
        })
      });

      // Filter list to response
      list = list.filter(item => response.versions.includes(item.version));
    }

    // Iterate list
    for (let i in list) {
      try {

        // Get local path
        var localpath = config.get(list[i].type);
        if (localpath == false) {
          continue;
        }

        // Make sure directory still exist
        fs.ensureDirSync(localpath);

        // Get request headers
        const { headers } = await axios({ url: list[i].url, method: 'HEAD' });

        // Define file sizes
        var fileSize = fs.existsSync(path.join(localpath, list[i].file)) ? fs.statSync(path.join(localpath, list[i].file)).size : 0;
        var totalFileSize = parseInt(headers['content-length']);

        // Initial status
        drawLine('\033[0;33m[' + list[i].version + ']\033[0m \033[0;35m[CHECKING]\033[0m');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Skip empty files
        if (totalFileSize == 0) {
          drawLine('\033[0;33m[' + list[i].version + ']\033[0m \033[0;33m[SKIPPING]\033[0m \n');
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }

        // Remove oversized file
        if (fileSize > totalFileSize) { // Remove damaged file on oversize
          drawLine('\033[0;33m[' + list[i].version + ']\033[0m \033[0;31m[OVERSIZE]\033[0m');
          fs.unlinkSync(path.join(localpath, list[i].file));
          fileSize = 0;
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Check file size matches
        if (fileSize == 0 || fileSize < totalFileSize) {

          // Get data with correct headers for download resume possibility
          const { data } = await axios({ url: list[i].url, method: 'GET', responseType: 'stream', headers: { range: 'bytes=' + fileSize + '-' } });

          // Create new file in append mode
          var file = fs.createWriteStream(path.join(localpath, list[i].file), { 'flags': 'a' });

          // Promise
          await new Promise((resolve, reject) => {
            // Proces on data
            data.on('data', (chunk) => {
              file.write(chunk);
              fileSize += chunk.length;
              drawLine('\033[0;33m[' + list[i].version + ']\033[0m \033[0;34m[DOWNLOAD]\033[0m - ' + (100.0 * fileSize / totalFileSize).toFixed(2) + '% (' + prettyBytes(fileSize) + ' of ' + prettyBytes(totalFileSize) + ')');
            });

            // Error happes
            data.on('error', (err) => {
              drawLine('\033[0;33m[' + list[i].version + ']\033[0m \033[0;31m[RETRYING]\033[0m');
              list.push(list[i]);
              reject(err);
            });

            // Connection timed out
            data.on('timeout', () => {
              drawLine('\033[0;33m[' + list[i].version + ']\033[0m \033[0;31m[RETRYING]\033[0m ');
              list.push(list[i]);
              reject('Connection timed out.');
            });

            // On success
            data.on('end', () => {
              drawLine('\033[0;33m[' + list[i].version + ']\033[0m \033[0;32m[COMPLETE]\033[0m');
              resolve();
            });
          });

        } else { // Just skip
          drawLine('\033[0;33m[' + list[i].version + ']\033[0m \033[0;32m[COMPLETE]\033[0m');
        }

        // New line
        drawLine('\n');

        // Fancyness, remember?
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (err) {
        console.log('\033[0;33m[' + list[i].version + ']\033[0;31m [ERROR] \033[0m ' + (err.message || err));
      }
    }

  } catch (error) {
    console.log('\033[0;33m[0.00.0.0000]\033[0;31m [ERROR] \033[0m ' + (error.message || error));
  }
})();

/* MAIN PROCESS
-------------------------------------------------------------- */
function drawLine(msg) {
  process.stdout.cursorTo(0);
  process.stdout.write(msg);
  process.stdout.clearLine(1);
}

function prettyBytes(value) {
  if (value === 0) {
    return '0 b';
  }
  const units = ['b', 'kB', 'MB', 'GB', 'TB'];
  const number = Math.floor(Math.log(value) / Math.log(1024));
  return (value / Math.pow(1024, Math.floor(number))).toFixed(2) + ' ' + units[number];
};
