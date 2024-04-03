

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

  // Stores generated output files
  const tempFolderPath = path.join(ROOT_PATH, 'temp');
  const tempExportPath = path.join(ROOT_PATH, 'temp', 'exporting');
  const tempImportPath = path.join(ROOT_PATH, 'temp', 'importing');

  // User storage
  const tracesDataPath = path.join(ROOT_PATH, 'traces');

  await makedir(tempFolderPath);
  await makedir(tempExportPath);
  await makedir(tempImportPath);
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

  // The python binary
  const binaryPathSrc = path.join('packaging', 'python-binary', 'dist', platform, arch, `garmin_video_processing${ext}`);
  const binaryPathDest = path.join(ROOT_PATH, 'processing', 'garmincatalyst', `garmin_video_processing${ext}`);

  // The template image
  const templateImageSrc = path.join('src', 'processing', 'templates', 'garmin_gforce_template.png');
  const templateImageDest = path.join(ROOT_PATH, 'processing', 'garmincatalyst', 'garmin_gforce_template.png');

  const binaryExists = await checkFileExists(binaryPathDest);
  const templateExists = await checkFileExists(templateImageDest);

  if (!binaryExists) {
    // FIXME: error handling, can't run app if these ops fail
    extractFromAsar(binaryPathSrc, binaryPathDest);
    if (platform !== 'win32') {
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

// Remove temporary files on exit
async function cleanUp() {
  const tempFolderPath = path.join(ROOT_PATH, 'temp');
  try {
    const files = await fs.readdir(tempFolderPath);
    for (const file of files) {
      const filePath = path.join(tempFolderPath, file);
      const stats = await fs.stat(filePath);
      if (!stats.isDirectory()) {
        await fs.unlink(filePath);
      }
    }

    const exportPath = path.join(tempFolderPath, 'exporting');
    fs.access(exportPath, async error => {
      if (!error) {
        await fs.rm(exportPath, { recursive: true });
      }
    });

    const importPath = path.join(tempFolderPath, 'importing');
    fs.access(importPath, async error => {
      if (!error) {
        await fs.rm(importPath, { recursive: true });
      }
    });

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
    INVALID_RESULT_DATA: 'invalid-result-data',
  });

  const type = args[0];
  const videoPath = args[1];
  const index = args[2];

  if (type !== 'garmincatalyst') {
    callback({
      'status': PythonStatus.UNSUPPORTED_TYPE,
      'index': index,
    });
    return;
  }

  const outputPath = path.join(ROOT_PATH, 'temp');
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
    // Use python directly when running from the source
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
          const data = await readJsonFile(resultsJsonPath);
          if (data === null) {
            callback({
              'status': PythonStatus.PYTHON_RUNTIME_ERROR,
              'index': index,
            });
          } else {
            const title = null;
            const videoPath = null;
            const trimRanges = [];
            const response = formTraceResultResponse('process', PythonStatus.OK, index,
              resultsJsonPath, videoPath, title, data['data'].numFrames, data['data'].fps, data['data'].trace, trimRanges);
            callback(response);
          }
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

    const { stdout, stderr } = await execPromise(cmd);

    const stdoutOutput = stdout.split('\n');
    if (stdoutOutput.length < 1) {
      if (platform === 'win32') {
        log.warn(`Did not find python3 from 'where'. Attempt 'python' if installed through the Windows Store`);
        return 'python';
      } else {
        log.error(`Failed to get the path to python. stdout = ${stdout} stderr = ${stderr}`);
        return null;
      }
    }

    const pythonPath = stdoutOutput[0].trim();

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
      'index': request['index'],
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
  log.debug(`Export trace request: ${JSON.stringify(request)}`);
  const ExportReponse = Object.freeze({
    ERROR: 'error',
    MISSING_VIDEO: 'missing-video',
    OK: 'ok',
  });

  const traces = request['traces'];
  const destDirPath = request['outputDest'];

  const ignoreTracesList = [];

  let destFullPath = path.join(destDirPath, 'ApexSense Exported Traces.apx');
  const zip = new AdmZip();

  for (const trace of traces) {
    const id = trace.traceId;
    const videoFound = trace.videoFound;
    if (!videoFound) {
      // Don't bother exporting if we can't find the video
      // We'll present to the user what couldn't be exported afterwards.
      ignoreTracesList.push(trace);
      continue;
    }

    const tracePath = path.join(ROOT_PATH, 'traces', id);
    const result = await getTitleAndVideoPathFromTrace(tracePath);
    if (result === null) {
      log.warn(`Could not get title and video path from the trace ${JSON.stringify(trace)}`);
      ignoreTracesList.push(trace);
      continue;
    }

    if (traces.length === 1) {
      const zipFileName = sanitizeFilename(result['title']);
      // custom extension purely so it's identifiable as being the thing to import later, it's just a zip file
      destFullPath = path.join(destDirPath, `${zipFileName}.apx`);
    }

    const zipFolderPath = path.join(result['title'])
    await zip.addLocalFolderPromise(tracePath, { zipPath: zipFolderPath });
    zip.addLocalFolder(tracePath, zipFolderPath);
    // The option to cache a video implies the video is already in the folder that will be zipped.
    // Only add the video file in if it doesn't already exist in this trace folder
    const doesVideoExistInTraceFolder = result['videoPath'].includes(tracePath);
    if (!doesVideoExistInTraceFolder) {
      if (await checkFileExists(result['videoPath'])) {
        const tempVideoExport = path.join(ROOT_PATH, 'temp', 'exporting', 'video.mp4');
        try {
          // copy, rename, rm copy
          await fs.copyFile(result['videoPath'], tempVideoExport);
          zip.addLocalFile(tempVideoExport, zipFolderPath);
          await fs.rm(tempVideoExport);
        } catch (error) {
          log.error(`Exporting error while attempting to make a copy of the video! ${JSON.stringify(result)} Error = ${error.message}`);
          ignoreTracesList.push(trace);
          zip.deleteFile(zipFolderPath);
          continue;
        }
      } else {
        log.error(`Exporting ${result['title']} failed due to video file ${result['videoPath']} not existing`);
        ignoreTracesList.push(trace);
        zip.deleteFile(zipFolderPath);
        continue;
      }
    }
  }

  try {
    await zip.writeZipPromise(destFullPath);
    shell.showItemInFolder(destFullPath);
    return {
      'status': ExportReponse.OK,
      'ignored': ignoreTracesList,
    };
  } catch (err) {
    log.error(`Failed to zip ${destFullPath}\n${JSON.stringify(request)}\nError=${err.message}`);
    log.error(`Error = ${err.message}`);
    return {
      'status': ExportReponse.ERROR,
      'error': err
    };
  }
}

async function getTitleAndVideoPathFromTrace(tracePath) {
  const jsonPath = path.join(tracePath, 'trace.json');
  const jsonTrace = await readJsonFile(jsonPath);
  if (jsonTrace === null) {
    return null;
  }
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

async function updateJsonAfterImport(destPath) {
  const traceFile = path.join(destPath, 'trace.json');
  const json = await readJsonFile(traceFile);
  if (json === null) {
    return false;
  }

  const newVideoPath = path.join(destPath, 'video.mp4');
  json['videoPath'] = newVideoPath;
  await fs.writeFile(traceFile, JSON.stringify(json));
}

async function importTrace(request) {
  const ImportResponse = Object.freeze({
    ERROR: 'error',
    WARN: 'warn',
    OK: 'ok'
  });

  log.debug(`Import trace request: ${JSON.stringify(request)}`);
  let importingOk = true;
  // request['traces'] is a list of .apx files (zips)
  for (const file of request['traces']) {
    const importingPath = path.join(ROOT_PATH, 'temp', 'importing');
    try {
      await fs.mkdir(importingPath, { recursive: true });

      const zip = new AdmZip(file);
      zip.extractAllTo(importingPath, true);

      const traceRoot = path.join(ROOT_PATH, 'traces');
      const extractedFolders = await fs.readdir(importingPath);

      if (extractedFolders.includes('trace.json') && extractedFolders.includes('video.mp4')) {
        // v1.0.0 of app only allowed extracting one trace at a time, and placed the files directly inside
        // instead of in unique folders per trace. Moving to a database makes more sense now. Just export the
        // tables and import. Too much filesystem manipulation for a trivial operation.
        try {
          const destPath = path.join(traceRoot, uuidv4());
          await fs.mkdir(destPath);
          await fs.cp(path.join(importingPath, 'trace.json'), path.join(destPath, 'trace.json'));
          await fs.cp(path.join(importingPath, 'video.mp4'), path.join(destPath, 'video.mp4'));

          if (!updateJsonAfterImport(destPath)) {
            importingOk = false;
          }

          await fs.rm(importingPath, { recursive: true });

        } catch (error) {
          log.error(`Failed to copy contents Error = ${error.message}`);
          return {
            'status': ImportResponse.ERROR,
            'error': error
          };
        }
      } else {
        for (const folder of extractedFolders) {
          if (folder.startsWith('.')) {
            continue;
          }

          try {
            const destPath = path.join(traceRoot, uuidv4());
            const importingTracePath = path.join(importingPath, folder);
            await fs.mkdir(destPath);
            await fs.cp(importingTracePath, destPath, { recursive: true });

            if (!updateJsonAfterImport(destPath)) {
              importingOk = false;
            }

            await fs.rm(importingTracePath, { recursive: true });
          } catch (err) {
            log.error(`Failed to copy contents of ${importingPath} to ${destPath}: ${err.message}`);
            continue;
          }
        }
      }
    } catch (err) {
      log.error(`Failed to import ${file} - Error: ${err.message}`);
      fs.rm(importingPath, { recursive: true });
      return {
        'status': ImportResponse.ERROR,
        'error': err
      };
    }
  }

  return {
    'status': (importingOk) ? ImportResponse.OK : ImportResponse.WARN
  }
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
      'index': request['index']
    };
  }
  // change `num_traces` to `numTraces` to standardize the naming convention
  updatePropertyName(json['data'], 'num_frames', 'numFrames');

  let trimRanges = [];
  if (json.hasOwnProperty('trim')) {
    trimRanges = json['trim'];
  }
  const response = formTraceResultResponse('read', ReadResponse.OK, request['index'],
    request['tracePath'], request['videoPath'], json['title'], json['data'].numFrames, json['data'].fps, json['data'].trace, trimRanges);

  return response;
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
      if (jsonTrace === null) {
        continue;
      }

      const videoFound = await checkFileExists(jsonTrace['videoPath']);
      traces.push({
        'traceId': traceId,
        'title': jsonTrace['title'],
        'tracePath': traceFile,
        'videoPath': jsonTrace['videoPath'],
        'videoFound': videoFound,
      });
    }

    traces.sort((a, b) => {
      if (a.title < b.title) {
        return -1;
      }
      if (a.title > b.title) {
        return 1;
      }
      return 0;
    });

    return {
      'status': ReadAllResponse.OK,
      'traces': traces,
      'index': request['index'],
    };

  } catch (error) {
    log.error(`Failed to readall traces. Error: ${error.message}`);
    return {
      'status': ReadAllResponse.ERROR,
      'index': request['index'],
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

  const Actions = Object.freeze({
    Title: 'title',
    VideoPath: 'videoPath',
    Trim: 'trim',
  });

  // to indicate to renderer what exactly was updated 
  let actionTaken = '';

  log.debug(`Update trace request: ${JSON.stringify(request)}`);
  let traceFile = null;
  if (request.hasOwnProperty('traceId')) {
    traceFile = path.join(ROOT_PATH, 'traces', request['traceId'], 'trace.json');
  } else {
    traceFile = request['jsonPath'];
  }
  const json = await readJsonFile(traceFile);
  if (json === null) {
    return {
      'status': UpdateResponse.ERROR,
      'index': request['index'],
      'error': 'Failed to read json file.',
    }
  }

  if (request.hasOwnProperty('trimRange')) {
    if (json.hasOwnProperty('trim')) {
      json['trim'].push({
        'label': request['label'],
        'range': request['trimRange']
      });
    } else {
      json['trim'] = [{
        'label': request['label'],
        'range': request['trimRange']
      }];
    }
    actionTaken = Actions.Trim;
  }

  if (request.hasOwnProperty('title')) {
    json['title'] = request['title'];
    actionTaken = Actions.Title;
  } else if (request.hasOwnProperty('updatedVideoPath')) {
    json['videoPath'] = request['updatedVideoPath'];
    actionTaken = Actions.VideoPath;
  }

  try {
    await fs.writeFile(traceFile, JSON.stringify(json));
  } catch (error) {
    log.error(`Failed to update ${traceFile}. Error: ${error.message}`);
    return {
      'status': UpdateResponse.ERROR,
      'index': request['index'],
      'error': error,
    }
  }

  return {
    'status': UpdateResponse.OK,
    'index': request['index'],
    'action': actionTaken,
    ...json,
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
        'index': request['index'],
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
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  }
  catch (err) {
    log.error(`Failed to read json file ${filePath}. Error = ${err.message}`);
    return null;
  }
}

function updatePropertyName(data, oldProp, newProp) {
  if (data.hasOwnProperty(oldProp)) {
    data[newProp] = data[oldProp];
    delete data[oldProp];
  }
}

function formTraceResultResponse(type, status, index, tracePath, videoPath, title, numFrames, fps, traceArray, trimArray) {
  function addIfNotNull(dict, key, value) {
    if (value !== null) {
      dict[key] = value;
    }
  }

  const response = {
    'type': type,
    'status': status,
    'index': index,
    'data': { // this is dependant on the type. Only garmin available so doesn't matter right now
      'fps': fps,
      'numFrames': numFrames,
      'trace': traceArray,
    },
    'trim': trimArray,
  }

  addIfNotNull(response['data'], 'videoPath', videoPath);
  addIfNotNull(response['data'], 'jsonPath', tracePath);
  addIfNotNull(response['data'], 'title', title);

  return response;
}


// IMPLEMENT THIS on next major version
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