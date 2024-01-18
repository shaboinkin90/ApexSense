const { app, ipcMain } = require('electron');
const mainLogic = require('./main_logic');

let mainWindow;
app.setName('ApexSense');

app.on('ready', async () => {
  mainWindow = mainLogic.createWindow();
  mainWindow.on('closed', function () {
    mainWindow = null;
  });
  await mainLogic.createAppSupportFolder();
});

app.on('window-all-closed', async () => {
  await mainLogic.cleanUp();
  app.quit();
});

app.on('activate', async () => {
  await mainLogic.createAppSupportFolder();

  if (mainWindow === null) {
    mainWindow = mainLogic.createWindow();
    mainWindow.on('closed', function () {
      mainWindow = null;
    });
  }
});

ipcMain.on('run-python-script', (_e, ...args) => {
  if (args.length !== 3) {
    mainWindow.webContents.send('python-error', 'Invalid arguments');
  }
  mainLogic.runPythonScript(args, (result) => {
    mainWindow.webContents.send('python-complete', result);
  });
});

ipcMain.on('open-video-dialog-prompt', (_e, index, isUpdatingPath, traceId) => {
  let result = {
    'index': index,
    'traceId': traceId,
  };
  mainLogic.openVideoDialogPrompt(isUpdatingPath, (dialogResult) => {
    result = { ...result, ...dialogResult };
    mainWindow.webContents.send('file-dialog-complete', result);
  });
});

ipcMain.on('import-traces-dialog-prompt', (_e, request) => {
  mainLogic.selectImportFilesDialogPrompt((dialogResult) => {
    const result = {
      'index': request['index'],
      'filesToImport': dialogResult,
    };
    mainWindow.webContents.send('import-traces-complete', result);
  });
});

ipcMain.on('export-location-dialog-prompt', (_e, request) => {
  mainLogic.selectExportLocationDialogPrompt((dialogResult) => {
    const result = {
      'traceId': request['traceId'],
      'outputDest': dialogResult,
    };
    mainWindow.webContents.send('export-location-complete', result);
  });
})

ipcMain.on('trace-file-io', async (_e, request) => {
  let result = {
    'type': request['type'],
  };
  switch (request['type']) {
    case 'create':
      const createResult = await mainLogic.createTrace(request);
      result = { ...result, ...createResult };
      break;

    case 'export':
      const exportResult = await mainLogic.exportTrace(request);
      result = { ...result, ...exportResult };
      break;

    case 'import':
      const importResult = await mainLogic.importTrace(request);
      result = { ...request, ...importResult };
      break;

    case 'read':
      const readResult = await mainLogic.readTrace(request);
      result = { ...result, ...readResult };
      break;

    case 'readall':
      const readAllResult = await mainLogic.readAllTraces(request);
      result = { ...result, ...readAllResult };
      break;

    case 'update':
      const updateResult = await mainLogic.updateTrace(request);
      result = { ...result, ...updateResult };
      break;

    case 'delete':
      const deleteResult = await mainLogic.deleteTrace(request);
      result = { ...result, ...deleteResult };
      break;

    default:
      console.error(`Unknown trace-io type: ${request.type}`);
      result['status'] = 'error';
  }
  mainWindow.webContents.send('trace-io-complete', result);
});