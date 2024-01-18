const { ipcRenderer, contextBridge } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  runPythonScript: (...args) => {
    // Required args[0] specifies what type of device, ie. 'garmincatalyst'
    // did the input data come from
    ipcRenderer.send('run-python-script', ...args);
  },
  selectFilesToImportDialogPrompt: (request) => {
    ipcRenderer.send('import-traces-dialog-prompt', request);
  },
  selectExportLocationDialogPrompt: (request) => {
    ipcRenderer.send('export-location-dialog-prompt', request)
  },
  openVideoDialogPrompt: (index, isUpdatingPath = false, userId = -1) => {
    // index == which grid in the UI it is operating from
    // isUpdatingPath == if the user wants to fix a broken path to a video file
    // userId == required for isUpdatingPath, the UUID folder name containing saved information
    ipcRenderer.send('open-video-dialog-prompt', index, isUpdatingPath, userId);
  },
  traceFileIO: (request) => {
    // request dictionary unique for local CRUD operations
    // request.type = 'create', 'read', 'readall', 'update', 'delete'
    // request.data // data source is 'type' defined
    ipcRenderer.send('trace-file-io', request);
  },
  receive: (channel, func) => {
    const validChannels = [
      'python-complete',
      'python-error',
      'file-dialog-complete',
      'import-traces-complete',
      'export-location-complete',
      'trace-io-complete'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => func(...args));
    }
  }
});