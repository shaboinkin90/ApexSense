

const { app, BrowserWindow, dialog, shell } = require("electron");
const { exec, spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');

const AdmZip = require('adm-zip');
const asar = require('asar');
const fs = require('fs').promises;
const log = require('electron-log');
const os = require('os');
const path = require('path');
const util = require('util');

if (require('electron-squirrel-startup')) return;
if (handleSquirrelEvent()) {
  return;
}

const ROOT_PATH = app.getPath('userData');

function createWindow() {
  const width = 1280;
  const height = 720;

  const mainWindow = new BrowserWindow({
    width: width,
    height: height,
    minWidth: width,
    minHeight: height,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    }
  });

  const filePath = path.join(__dirname, '..', 'html', 'index.html');
  mainWindow.loadFile(filePath);

  return mainWindow;
}

async function createAppSupportFolder() {
  async function makedir(path) {
    const exists = await checkFileExists(path);
    if (!exists) {
      await fs.mkdir(path, { recursive: true });
    }
  }

  // Stores python generated output files
  const tempFolderPath = path.join(ROOT_PATH, 'temp');

  // User storage
  const tracesDataPath = path.join(ROOT_PATH, 'traces');

  await makedir(tempFolderPath);
  await makedir(tracesDataPath);

  // extract and store the video processing binary
  if (app.isPackaged) {
    const processingBinaryPath = path.join(ROOT_PATH, 'processing', 'garmincatalyst');
    await makedir(processingBinaryPath);
    await extractProcessingBinary();
  }
}

// We have a binary embedded in the asar and the template image required to mask on. We 
// need to extract it and place it in the respective directory so the app can call on it
async function extractProcessingBinary() {
  const arch = os.arch();
  const platform = os.platform();

  if (platform !== 'darwin' && platform !== 'win32' && platform !== 'linux') {
    log.error(`Unsupported platform ${platform}`);
    throw new Error(`Unsupported platform ${platform}`);
  }
  if (arch !== 'x64' && arch !== 'arm64') {
    log.error(`Unsupported CPU arch ${arch}`);
    throw new Error(`Unsupported CPU arch ${arch}`);
  }

  let ext = "";
  if (platform === 'win32') {
    ext = '.exe';
  }

  // The binary
  const binaryPathSrc = path.join('packaging', 'python-binary', 'dist', platform, arch, `garmin_video_processing${ext}`);
  const binaryPathDest = path.join(ROOT_PATH, 'processing', 'garmincatalyst', `garmin_video_processing${ext}`);

  // The template
  const templateImageSrc = path.join('src', 'processing', 'templates', 'garmin_gforce_template.png');
  const templateImageDest = path.join(ROOT_PATH, 'processing', 'garmincatalyst', 'garmin_gforce_template.png');

  const binaryExists = await checkFileExists(binaryPathDest);
  const templateExists = await checkFileExists(templateImageDest);

  log.debug(`\nbinary src: ${binaryPathSrc}\n` +
    `binary dest: ${binaryPathDest}\n` +
    `template src: ${templateImageSrc}\n` +
    `template dest: ${templateImageDest}\n` +
    `binary exists: ${binaryExists}\n` +
    `template exists: ${templateExists}`);

  if (!binaryExists) {
    // FIXME: error handling, can't run app if these ops fail
    extractFromAsar(binaryPathSrc, binaryPathDest);

    if (os.platform() !== 'win32') {
      // set executable
      fs.chmod(binaryPathDest, '0775');
    }
  }

  if (!templateExists) {
    extractFromAsar(templateImageSrc, templateImageDest);
  }
}

async function extractFromAsar(src, dest) {
  log.debug(`Extracting ${src} to ${dest}`)
  const buffer = asar.extractFile(app.getAppPath(), src);
  try {
    await fs.writeFile(dest, buffer);
  } catch (err) {
    log.error(`asar extraction failed. Error = ${err.message}`);
  }
}

// Remove temporary .json files on exit
async function cleanUp() {
  const tempFolderPath = path.join(ROOT_PATH, 'temp');
  try {
    const files = await fs.readdir(tempFolderPath);
    for (const file of files) {
      const filePath = path.join(tempFolderPath, file);
      await fs.unlink(filePath);
    }
  } catch (err) {
    log.warn(`Error on clean up: ${err.message}`);
  }
}

/****** IPC MESSAGES ******/

/** run-python-script **/
async function runPythonScript(args, callback) {
  const PythonStatus = Object.freeze({
    OK: 'ok',
    UNSUPPORTED_TYPE: 'unsupported-type',
    NO_PYTHON_FOUND: 'no-python-found',
    PYTHON_RUNTIME_ERROR: 'python-runtime-error',
  });

  const type = args[0];
  const videoPath = args[1];
  const index = args[2];

  if (type !== 'garmincatalyst') {
    callback({
      'status': PythonStatus.UNSUPPORTED_TYPE,
      'index': index,
    });
  }


  let outputPath = path.join(ROOT_PATH, 'temp');
  let process = null;

  if (app.isPackaged) {
    let ext = "";
    if (os.platform() === 'win32') {
      ext = '.exe';
    }

    const pythonScriptPath = path.join(ROOT_PATH, 'processing', 'garmincatalyst', `garmin_video_processing${ext}`);
    const templatePath = path.join(ROOT_PATH, 'processing', 'garmincatalyst', 'garmin_gforce_template.png');
    log.debug(`Running python binary: ${pythonScriptPath} --data_source ${type} ` +
      `--data_file_path ${videoPath} --template_path ${templatePath} --output_path ${outputPath}`);

    process = spawn(
      pythonScriptPath,
      [
        '--data_source', type,
        '--data_file_path', videoPath,
        '--template_path', templatePath,
        '--output_path', outputPath,
      ]
    );
  } else {
    const pythonPath = await getPythonPath();
    if (pythonPath === null) {
      callback({
        'status': PythonStatus.NO_PYTHON_FOUND,
        'index': index,
      });
      return;
    }

    const pythonScriptPath = path.join('src', 'processing', 'garmin_video_processing.py');
    const templatePath = path.join('src', 'processing', 'templates', 'garmin_gforce_template.png');

    // Use python when running from the source
    log.debug(`Running python script: ${pythonPath} -u ${pythonScriptPath} --data_source ${type} ` +
      `--data_file_path ${videoPath} --template_path ${templatePath} --output_path ${outputPath}`);

    process = spawn(
      pythonPath,
      [
        '-u',
        pythonScriptPath,
        '--data_source', type,
        '--data_file_path', videoPath,
        '--template_path', templatePath,
        '--output_path', outputPath,
      ]
    );
  }

  let resultsJsonPath = '';
  process.stdout.on('data', (data) => {
    // FIXME: Too idealistic.
    // If any print statements are added to the script, this will break.
    // If there's a need later on to define a protocol of sorts, do that.
    // Progress messages may be something worth adding instead of the 
    // indeterminate spinner while running the script. 
    resultsJsonPath = data.toString().trim();
  });

  process.stderr.on('data', (data) => {
    log.error(`Python error ${data}`);
    callback({
      'status': PythonStatus.PYTHON_RUNTIME_ERROR,
      'data': data,
      'index': index,
    });
  });

  process.on('close', async (_code) => {
    await checkFileExists(resultsJsonPath)
      .then(async (exists) => {
        if (exists) {
          const fileContents = await fs.readFile(resultsJsonPath, 'utf8');
          callback({
            'status': PythonStatus.OK,
            'data': fileContents,
            'jsonPath': resultsJsonPath,
            'index': index,
          });
        } else {
          log.error(`${resultsJsonPath} does not exist!`);
          callback({
            'status': PythonStatus.PYTHON_RUNTIME_ERROR,
            'index': index,
          });
        }
      });
  });
}

async function getPythonPath() {
  try {
    const execPromise = util.promisify(exec);
    const platform = os.platform();

    let cmd = '';
    if (platform === 'darwin' || platform === 'linux') {
      cmd = 'which python3';
    } else if (platform === 'win32') {
      cmd = 'where python3';
    }

    const { stdout } = await execPromise(cmd);

    if (stdout.split('\n').length < 1) {
      if (platform === 'win32') {
        log.warn(`Did not find python3 from where. Attempt 'python' if installed through the Windows Store`);
        return 'python';
      } else {
        log.error(`Failed to get the path to python. stdout = ${stdout}`);
        return null;
      }
    }

    const pythonPath = stdout.split('\n')[0].trim();

    if (platform === 'win32' && pythonPath.includes('WindowsApps')) {
      // If the path is for the Windows store version, you get weird error messages trying to 
      // directly use the executable. Simplying calling on `python` does the trick.
      return 'python';
    }

    return pythonPath;

  } catch (err) {
    log.error(`Python is not installed or not found in the PATH environment variable. Error: ${err.message}`);
    return null;
  }
}


/** open-video-dialog-prompt **/
function openVideoDialogPrompt(isUpdatingPath, callback) {
  const response = Object.freeze({
    NEW_VIDEO_SELECTED: 'new-video-select',
    UPDATED_VIDEO_PATH: 'updated-video-path',
  });

  dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Movies', extensions: ['mp4'] }],
  })
    .then(result => {
      if (!result.canceled && result.filePaths.length === 1) {
        const filePath = result.filePaths[0];
        if (isUpdatingPath) {
          log.debug(`Updated video path: ${filePath}`);
          callback({
            'type': response.UPDATED_VIDEO_PATH,
            'path': filePath
          });
        } else {
          log.debug(`Selected video path: ${filePath}`);
          callback({
            'type': response.NEW_VIDEO_SELECTED,
            'path': filePath
          });
        }
      }
    });
}

/***** trace-io ******/

/* create */
async function createTrace(request) {
  const ResponseStatus = Object.freeze({
    ERROR: 'error',
    OK: 'ok',
  });

  log.debug(`Create trace request: ${JSON.stringify(request)}`);

  const id = uuidv4();
  const outputPath = path.join(ROOT_PATH, 'traces', id);

  try {
    await fs.mkdir(outputPath, { recursive: true });

    const jsonTrace = await readJsonFile(request['jsonPath']);
    if (request['cacheVideo']) {
      const newVideoPath = await cacheVideo(request['videoPath'], outputPath);
      jsonTrace['videoPath'] = newVideoPath;
    } else {
      jsonTrace['videoPath'] = request['videoPath'];
    }

    // add the title to the json we'll save, file names are the same but in unique directories.
    // NOTE: i wonder if a small db would be easier to work with then messing around with individual files
    // it'd allow for more complex filtering than just searching for titles
    // ex: dates, location, driver, car, etc.
    jsonTrace['title'] = request['title'];

    // json structure: 
    // {
    //  'data': { specific to what is processed },
    //  'videoPath': 'path/to/video.mp4',
    //  'title': 'title-to-display-in-app',
    // }
    const outputTracePath = path.join(outputPath, 'trace.json');
    await fs.writeFile(outputTracePath, JSON.stringify(jsonTrace));
    return {
      'status': ResponseStatus.OK,
      'outputPath': outputTracePath,
      'title': jsonTrace['title'],
      'index': request['index'],
    };
  } catch (error) {
    log.error(error);
    return {
      'status': ResponseStatus.ERROR,
      'error': error,
    };
  }
}

async function cacheVideo(videoPath, outputPath) {
  const newVideoPath = path.join(outputPath, 'video.mp4');
  await fs.copyFile(videoPath, newVideoPath);
  return newVideoPath
}

/* export */
function selectExportLocationDialogPrompt(callback) {
  dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: "Select a Folder to export your trace",
  })
    .then(result => {
      if (!result.canceled && result.filePaths && result.filePaths.length === 1) {
        callback(result.filePaths[0]);
      }
    });
}

async function exportTrace(request) {
  const ExportReponse = Object.freeze({
    ERROR: 'error',
    MISSING_VIDEO: 'missing-video',
    OK: 'ok',
    CANCELED: 'canceled',
  });

  log.debug(`Export trace request: ${JSON.stringify(request)}`);

  const destDirPath = request['outputDest'];
  const tracePath = path.join(ROOT_PATH, 'traces', request['traceId']);

  const result = await getTitleAndVideoPathFromTrace(tracePath);

  const zipFileName = sanitizeFilename(result['title']);
  // custom extension purely so it's identifiable as being the thing to import later, it's just a zip file
  const destFullPath = path.join(destDirPath, `${zipFileName}.apx`);

  const zip = new AdmZip();
  zip.addLocalFolder(tracePath);

  // The option to cache a video implies the video is already in the folder that will be zipped.
  // Only add the video file in if it doesn't already exist in this trace folder
  const doesVideoExistInTraceFolder = result['videoPath'].includes(tracePath);
  if (!doesVideoExistInTraceFolder) {
    if (await checkFileExists(result['videoPath'])) {
      zip.addLocalFile(result['videoPath'], '', 'video.mp4');
    } else {
      log.error(`Exporting ${result['title']} failed due to video file ${result['videoPath']} not existing`);
      return { 'status': ExportReponse.MISSING_VIDEO }
    }
  }

  try {
    zip.writeZip(destFullPath);
    shell.showItemInFolder(destFullPath);
    return {
      'status': ExportReponse.OK
    };
  } catch (err) {
    log.error(`Failed to zip ${tracePath}`);
    log.error(`Error = ${err.toString()}`);
    return {
      'status': ExportReponse.ERROR,
      'error': err
    };
  }
}

async function getTitleAndVideoPathFromTrace(tracePath) {
  const jsonPath = path.join(tracePath, 'trace.json');
  const jsonTrace = await readJsonFile(jsonPath);
  return {
    'title': jsonTrace['title'],
    'videoPath': jsonTrace['videoPath']
  };
}

function sanitizeFilename(input) {
  const forbiddenChars = /[\\\/:*?"<>|\x00-\x1F]/g;
  let sanitized = input.replace(forbiddenChars, '_');
  sanitized = sanitized.trim();
  return sanitized;
}

/* import */
function selectImportFilesDialogPrompt(callback) {
  dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    title: "Select traces to import",
    filters: [{ name: 'ApexSense trace', extensions: ['apx'] }],
  })
    .then(result => {
      if (!result.canceled && result.filePaths) {
        callback(result.filePaths);
      }
    });
}

async function importTrace(request) {
  const ImportResponse = Object.freeze({
    ERROR: 'error',
    OK: 'ok'
  });

  log.debug(`Import trace request: ${JSON.stringify(request)}`);

  for (const file of request['traces']) {
    const id = uuidv4();
    const outputPath = path.join(ROOT_PATH, 'traces', id);

    try {
      await fs.mkdir(outputPath, { recursive: true });
      const zip = new AdmZip(file);
      zip.extractAllTo(outputPath, true);

      // update json 'videoPath' to point to this new directory
      const traceFile = path.join(outputPath, 'trace.json');
      const json = await readJsonFile(traceFile);
      const newVideoPath = path.join(outputPath, 'video.mp4');
      json['videoPath'] = newVideoPath;
      await fs.writeFile(traceFile, JSON.stringify(json));

    } catch (err) {
      log.error(`Failed to import ${file}`);
      log.error('Error:', err.message, 'Stack:', err.stack);

      return {
        'status': ImportResponse.ERROR,
        'error': err
      };
    }
  };

  return {
    'status': ImportResponse.OK
  };

}
/* read */
async function readTrace(request) {
  const ReadResponse = Object.freeze({
    ERROR: 'error',
    OK: 'ok'
  });

  log.debug(`Read trace request: ${JSON.stringify(request)}`);

  const json = await readJsonFile(request['tracePath']);
  if (json === null) {
    return {
      'status': ReadResponse.ERROR,
      'error': error
    };
  }

  return {
    'status': ReadResponse.OK,
    'trace': json,
    'index': request['index'],
    'videoPath': request['videoPath']
  };
}

/* readall */
async function readAllTraces(request) {
  const ReadAllResponse = Object.freeze({
    ERROR: 'error',
    OK: 'ok'
  });

  log.debug(`Read all traces request: ${JSON.stringify(request)}`);

  const traces = [];

  try {
    const tracesPath = path.join(ROOT_PATH, 'traces');
    const traceFolder = await getTraces(tracesPath);
    if (Object.keys(traceFolder).length < 1) {
      log.warn(`There is no traces at ${tracesPath}`);
      return {
        'status': ReadAllResponse.OK,
        'index': request['index'],
        'traces': [],
      };
    }

    for (const [traceId, traceFiles] of Object.entries(traceFolder)) {
      const traceFile = traceFiles.find(file => file.includes('trace.json'));
      if (!traceFile) {
        log.error(`Did not find trace.json at ${traceId}`);
        // FIXME: how best to handle this for the user? 
        // If the video exists, we could just reprocess..
        // If no video, suggest to delete and remake?
        continue;
      }

      const jsonTrace = await readJsonFile(traceFile);
      const videoFound = await checkFileExists(jsonTrace['videoPath']);
      traces.push({
        'traceId': traceId,
        'title': jsonTrace['title'],
        'tracePath': traceFile,
        'videoPath': jsonTrace['videoPath'],
        'videoFound': videoFound,
      });
    }

    return {
      'status': ReadAllResponse.OK,
      'traces': traces,
      'index': request['index'],
    };

  } catch (error) {
    log.error(`Failed to readall traces. Error: ${error.message}`);
    return {
      'status': ReadAllResponse.ERROR,
      'error': error
    };
  }
}

async function getTraces(tracesPath) {
  const traceContents = {};
  const traces = await fs.readdir(tracesPath);
  for (const trace of traces) {
    // trace == UUID folder name
    const tracePath = path.join(tracesPath, trace);
    const stats = await fs.stat(tracePath);
    if (stats.isDirectory()) {
      const contents = await getTraceContents(tracePath);
      if (contents.length === 0) {
        continue;
      }
      traceContents[trace] = contents;
    }
  }

  return traceContents;
}

async function getTraceContents(tracePath) {
  const traceFiles = [];
  const contents = await fs.readdir(tracePath);
  // individual files within the UUID folder (trace.json, video.mp4)
  for (const file of contents) {
    if (file === 'trace.json' || file === 'video.mp4') {
      const filePath = path.join(tracePath, file)
      traceFiles.push(filePath);
    }
  }
  return traceFiles;
}

/* update */
async function updateTrace(request) {
  // updating just means adjusting the path of the video file
  // this could be expand to changing the title
  const UpdateResponse = Object.freeze({
    ERROR: 'error',
    OK: 'ok',
  });

  log.debug(`Update trace request: ${JSON.stringify(request)}`);

  try {
    const traceFile = path.join(ROOT_PATH, 'traces', request['traceId'], 'trace.json')
    const json = await readJsonFile(traceFile);

    json['videoPath'] = request['updatedVideoPath'];

    await fs.writeFile(traceFile, JSON.stringify(json));

  } catch (error) {
    log.error(`Failed to update ${traceFile}. Error: ${error.message}`);
    return {
      'status': UpdateResponse.ERROR,
      'error': error,
    }
  }

  return {
    'status': UpdateResponse.OK,
  };
}

/* delete */
async function deleteTrace(request) {
  const DeleteReponse = Object.freeze({
    ERROR: 'error',
    OK: 'ok'
  });

  log.debug(`Delete trace request: ${JSON.stringify(request)}`);

  const userPath = path.join(ROOT_PATH, 'traces', request['traceId']);
  await fs.rm(userPath, { recursive: true }, (error) => {
    if (error) {
      log.error(`Error removing ${userPath}.${error}`);
      return {
        'status': DeleteReponse.ERROR,
        'error': error
      };
    }
  });
  return {
    'status': DeleteReponse.OK,
    'index': request['index'],
  }
}

async function checkFileExists(file) {
  return fs.access(file, fs.constants.F_OK)
    .then(() => true)
    .catch(() => false);
}

async function readJsonFile(filePath) {
  const data = await fs.readFile(filePath, 'utf8');
  return JSON.parse(data);
}

// IMPLEMENT THIS on next version
/*
// const { autoUpdater } = require('electron-updater')
autoUpdater.setFeedURL('https://bork.mork');
autoUpdater.on('update-available', () => {

});

autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName, reelaseDate, updateUrl) => {
  // releaseName windows only
  // autoUpdater.quitAndInstall()
});

autoUpdater.on('before-quit-for-update', () => {

});

autoUpdater.on('update-not-available', () => {

});
autoUpdater.on('error', () => {

});

autoUpdater.on('checking-for-update', () => {

});
*/

function handleSquirrelEvent() {
  if (process.argv.length === 1) {
    return false;
  }

  const appFolder = path.resolve(process.execPath, '..');
  const rootFolder = path.resolve(appFolder, '..');
  const updateDotExe = path.resolve(path.join(rootFolder, 'Update.exe'));
  const exeName = path.basename(process.execPath);

  const spawnCommand = function (command, args) {
    return new Promise((resolve, reject) => {
      const spawnedProcess = spawn(command, args, { detached: true });

      spawnedProcess.on('close', resolve);
      spawnedProcess.on('error', (error) => {
        log.error(`spawn failed with ${error.message}`);
        reject(error);
      });
    });
  };

  const spawnUpdate = function (args) {
    return spawnCommand(updateDotExe, args);
  };

  const squirrelEvent = process.argv[1];

  // Create short cuts
  switch (squirrelEvent) {
    case '--squirrel-install':
    case '--squirrel-updated':
      return spawnUpdate(['--createShortcut', exeName])
        .then(() => app.quit())
        .catch((error) => {
          log.error(`Failed to create shortcuts: ${error.message}`);
        });

    case '--squirrel-uninstall':
      return spawnUpdate(['--removeShortcut', exeName])
        .then(() => app.quit())
        .catch((error) => {
          log.error(`Failed to remove shortcuts: ${error.message}`);
        });

    case '--squirrel-obsolete':
      app.quit();
      return true;
  }
};

module.exports = {
  createWindow,
  createAppSupportFolder,
  cleanUp,
  runPythonScript,
  openVideoDialogPrompt,
  createTrace,
  exportTrace,
  selectImportFilesDialogPrompt,
  selectExportLocationDialogPrompt,
  importTrace,
  readTrace,
  readAllTraces,
  updateTrace,
  deleteTrace,
}