let tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
let tooltipList = [...tooltipTriggerList].map(tooltipTrigger => new bootstrap.Tooltip(tooltipTrigger));

function refreshTooltip() {
  tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  tooltipList = [...tooltipTriggerList].map(tooltipTrigger => new bootstrap.Tooltip(tooltipTrigger));
}

function toggleElementVisability(isEnable, elementList) {
  if (isEnable) {
    elementList.forEach(div => {
      div.style.opacity = 1;
      div.style.pointerEvents = 'auto';
      div.style.disable = false;
    });
  } else {
    elementList.forEach(div => {
      div.style.opacity = 0.5;
      div.style.pointerEvents = 'none';
      div.style.disable = true;
    });
  }
}

function showToast(message, isSuccess) {
  const toastContainer = document.getElementById('status-toast-container');
  const toastId = `toast-${Date.now()}`;
  const statusClass = (isSuccess) ? 'bg-success' : 'bg-danger';
  const toastHtml = `
    <div id="${toastId}" class="toast ${statusClass} align-items-center text-bg-primary border-0" style="z-index: 1001;">
      <div class="d-flex">  
        <div class="toast-body">
          ${message}
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    </div>
  `;
  toastContainer.insertAdjacentHTML('beforeend', toastHtml);
  const toast = document.getElementById(toastId);
  const toastBootstrap = bootstrap.Toast.getOrCreateInstance(toast);

  const closeBtn = toast.querySelector('.btn-close');
  closeBtn.addEventListener('click', () => {
    toast.remove();
  });

  toastBootstrap.show();
}

// Stores UI elements per row, key == position index
const rowUIElementMap = new Map();
const headerCompareButtons = document.getElementById('header-compare-buttons');
const headerSyncToggles = document.getElementById('header-sync-toggles');

toggleElementVisability(false, [headerCompareButtons, headerSyncToggles]);

const minusBtn = document.getElementById('minus-button').addEventListener('click', () => {
  removeRow();
});

const plusBtn = document.getElementById('plus-button').addEventListener('click', () => {
  addRow();
});

// Sync views 
let shouldSyncViews = false;
let shouldSyncVideos = false;

const syncGraphViewOption = document.getElementById('sync-view-option');
const syncGraphViewCheckBtn = document.getElementById('sync-view-checkbox');
syncGraphViewCheckBtn.addEventListener('click', () => {
  shouldSyncViews = !shouldSyncViews;
});

const syncVideoPlaybackOption = document.getElementById('sync-video-option');
const syncVideoPlaybackCheckBtn = document.getElementById('sync-video-checkbox');

syncVideoPlaybackCheckBtn.addEventListener('click', () => {
  shouldSyncVideos = !shouldSyncVideos;
});


// MAIN-CONTENT
function landingViewTransistion() {
  document.getElementById('landing-view').hidden = true;
  toggleElementVisability(true, [headerCompareButtons]);
  const rootDiv = document.getElementById('main-content');
  rootDiv.hidden = false;
  buildRow(rootDiv, 1);
}

document.getElementById('get-started-btn').addEventListener('click', () => {
  landingViewTransistion();
});

// SAVING UI/Action
const saveCard = document.getElementById('save-card-element');
const commitSaveBtn = document.getElementById('commit-save-button');
const cancelSaveBtn = document.getElementById('cancel-save-button');
function saveAction() {
  if (!saveCard.hasAttribute('save-event-row-id')) {
    console.error('No id to reference while saving');
    return;
  }

  const title = document.getElementById('form-trace-title');
  if (title.value.trim() === '') {
    const errorMessage = "Please provide a title for the trace.";
    title.style.border = "2px solid red";
    alert(errorMessage);
    return;
  }

  const rowIndex = saveCard.getAttribute('save-event-row-id');
  const uiElements = rowUIElementMap.get(parseInt(rowIndex, 10));

  const shouldCacheVideo = document.getElementById('store-video-checkbox').checked;
  const videoPath = uiElements['dataStash'].videoPath;
  const jsonPath = uiElements['dataStash'].traceJsonPath;
  const saveRequest = {
    'type': 'create',
    'index': rowIndex,
    'title': title.value,
    'cacheVideo': shouldCacheVideo,
    'videoPath': videoPath,
    'jsonPath': jsonPath,
  }
  console.log(saveRequest);
  saveCard.removeAttribute('save-event-row-id');
  window.electron.traceFileIO(saveRequest);
}

commitSaveBtn.addEventListener('click', () => {
  saveAction();
});

function saveTraceCompletion(results) {
  saveCard.hidden = true;

  const title = document.getElementById('form-trace-title');
  title.value = '';

  const views = document.querySelectorAll('.fade-overlay')
  views.forEach(view => {
    view.hidden = true;
  });

  const uiElements = rowUIElementMap.get(parseInt(results['index'], 10));
  if (!uiElements) {
    // not fatal, though it would be odd
    console.warn(`No UI entry for ${results['index']} for updating graph title`);
  } else {
    const gForcePlot = uiElements['gForcePlot'];
    if (!gForcePlot) {
      console.error(`No gForcePlot set!\n
      ${JSON.stringify(results)}\n
      ${JSON.stringify(uiElements)}`);
    }
    gForcePlot.updateTitle(results['title']);
  }
  if (results['status'] === 'ok') {
    showToast('Save successful', true);
  } else {
    console.error(results['error']);
    showToast('There was a problem saving the trace', false);
  }
}

function cancelSaveCardAction() {
  saveCard.removeAttribute('save-event-row-id');
  saveCard.hidden = true;
  const views = document.querySelectorAll('.fade-overlay')
  views.forEach(view => {
    view.style.display = 'none';
  });
}

cancelSaveBtn.addEventListener('click', () => {
  cancelSaveCardAction();
});

/* LOAD TRACE VIEW */
const loadView = document.getElementById('load-trace-view');
const backBtnLoadView = document.getElementById('back-btn-load-view');

function dismissLoadViewAction() {
  loadView.hidden = true;
  document.getElementById('main-content').hidden = false;
}

backBtnLoadView.addEventListener('click', () => {
  dismissLoadViewAction();
});

const searchBar = document.getElementById('search-bar');
searchBar.addEventListener('input', (e) => {
  searchTracesAction(e);
});

function loadTraceCompletion(result) {
  loadView.hidden = true;
  document.getElementById('main-content').hidden = false;

  const uiElements = rowUIElementMap.get(result['index']);
  if (!uiElements) {
    console.warn(`No UI entry for ${index}?`);
    showToast('There was a problem loading this trace', false);
    return;
  }

  const leftColumn = uiElements['leftColumn'];
  const rightColumn = uiElements['rightColumn'];

  leftColumn['dropZoneContainer'].container.hidden = true;
  leftColumn['videoContainer'].container.hidden = false;
  leftColumn['videoContainer'].videoPlayer.src = result['videoPath'];
  if (leftColumn['videoContainer'].videoPlayer.hasAttribute('plotly-paused')) {
    leftColumn['videoContainer'].videoPlayer.removeAttribute('plotly-paused');
  }

  rightColumn['loadingSpinner'].hidden = true;

  const viewBtnGroup = uiElements['leftColumn'].viewToggleButtons.buttonGroup;
  const saveBtn = uiElements['leftColumn'].crudButtons.saveBtn;
  const videoControls = uiElements['leftColumn'].videoControls.container;
  toggleElementVisability(true, [saveBtn, viewBtnGroup, videoControls]);
  toggleElementVisability(true, [headerSyncToggles]);

  rightColumn['plotly'].top.hidden = false;
  rightColumn['plotly'].bottom.hidden = true;

  const title = result['trace']['title'];
  const params = {
    'view': '3d',
    'trace': result['trace'],
    'title': title
  };

  uiElements.gForcePlot.prepareGraphs(params);
  uiElements.gForcePlot.viewGraph('3d');
}

function isVideoPlaying(videoElement) {
  return !videoElement.paused && !videoElement.ended && videoElement.readyState > 2;
}

let debounceTimer;
function debounce(func, delay) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(func, delay);
}


// Callback issued from GForcePlot
function syncCameras(originGraph, view, originCamera) {
  if (!shouldSyncViews) {
    return;
  }

  rowUIElementMap.forEach((value, _key) => {
    const plotlyGraphs = value['rightColumn'].plotly;

    if (view === '2d') {
      // 2 graphs per row - need to figure out who was the trigger
      // for graphs existing in other rows than the one the trigger graph came from,
      // we need to update both top and bottom div's.
      // ie.
      //  row1, trigger from top graph, need to update bottom graph,
      //  row2, trigger came from row1, need to update top and bottom graph
      let graphToSync = null;
      if (originGraph === plotlyGraphs.top) {
        graphToSync = plotlyGraphs.bottom;
      } else if (originGraph === plotlyGraphs.bottom) {
        graphToSync = plotlyGraphs.top;
      }


      // So if there's no graphToSync set, we can deduce this iteration of the ui map
      // is from a different row where *both* graphs need to be updated
      if (graphToSync === null) {
        value.gForcePlot.syncGraphViews(plotlyGraphs.top, view, originCamera);
        value.gForcePlot.syncGraphViews(plotlyGraphs.bottom, view, originCamera);
      } else {
        value.gForcePlot.syncGraphViews(graphToSync, view, originCamera);
      }
    }
    else if (view === '3d') {
      // top graph is only used for 3d
      const graph = plotlyGraphs.top;
      if (originGraph === graph) {
        return;
      }
      if (graph) {
        value.gForcePlot.syncGraphViews(graph, '3d', originCamera);
      }
    }
  });
}


/* IPC */
function processVideo(videoPath, rowIndex) {
  const uiElements = rowUIElementMap.get(rowIndex);
  if (uiElements) {
    uiElements['dataStash'].videoPath = videoPath;
    window.electron.runPythonScript('garmincatalyst', videoPath, rowIndex);
  }
}

window.electron.receive('python-complete', (result) => {
  const status = result['status']
  if (status === 'ok') {
    const uiElements = rowUIElementMap.get(result['index']);
    if (uiElements) {
      uiElements['rightColumn'].loadingSpinner.hidden = true;
      uiElements['rightColumn'].plotly.top.hidden = false;
      uiElements['rightColumn'].plotly.bottom.hidden = true;

      try {
        const jsonData = JSON.parse(result['data']);
        const params = {
          'view': '3d',
          'trace': jsonData,
          'title': null,
        };

        uiElements.gForcePlot.prepareGraphs(params);
        uiElements.gForcePlot.viewGraph('3d');

        uiElements['dataStash'].traceJsonPath = result['jsonPath'];
        uiElements['rightColumn'].plotly.top.setAttribute('has-data', '');
        uiElements['rightColumn'].plotly.bottom.removeAttribute('has-data');
        const viewBtnGroup = uiElements['leftColumn'].viewToggleButtons.buttonGroup;
        const saveBtn = uiElements['leftColumn'].crudButtons.saveBtn;
        const videoControls = uiElements['leftColumn'].videoControls.container;
        toggleElementVisability(true, [saveBtn, viewBtnGroup, videoControls]);
        toggleElementVisability(true, [headerSyncToggles]);
      } catch (error) {
        console.error(`Could not parse the output data ${error}`);
        showToast('There was a problem with generating the graph', false);
      }
    }
  } else if (status === 'unsupported-type') {
    showToast('Unsupported operation', false);
  } else if (status === 'no-python-found') {
    showToast('Python was not detected on the system', false);
  } else if (status === 'python-runtime-error') {
    showToast('There was a problem processing the video', false);
  } else {
    console.error(`Unknown error in python-complete: ${status}`);
  }
});

window.electron.receive('python-error', (result) => {
  // FIXME: how to handle errors
  showToast(result['status']);
})

window.electron.receive('file-dialog-complete', (result) => {
  const videoPath = result['path'];
  const type = result['type'];
  const index = result['index'];
  if (type === 'new-video-select') {
    const uiElements = rowUIElementMap.get(index);
    if (!uiElements) {
      console.error(`row ${index} not found!`);
      return;
    }

    const leftColumn = uiElements['leftColumn'];
    const rightColumn = uiElements['rightColumn'];

    const dropZoneContainer = leftColumn['dropZoneContainer'].container;
    dropZoneContainer.hidden = true;

    const videoContainer = leftColumn['videoContainer'].container;
    videoContainer.hidden = false;

    const videoPlayer = leftColumn['videoContainer'].videoPlayer;
    videoPlayer.src = videoPath;

    const loadingSpinner = rightColumn['loadingSpinner'];
    loadingSpinner.hidden = false;
    processVideo(videoPath, index);
  } else if (type === 'updated-video-path') {
    const request = {
      'type': 'update',
      'traceId': result['traceId'],
      'index': index,
      'updatedVideoPath': videoPath,
    }
    window.electron.traceFileIO(request);
  }
});

window.electron.receive('import-traces-complete', (result) => {
  if (result['filesToImport'].length === 0) {
    return;
  }

  const request = {
    'type': 'import',
    'index': result['index'],
    'traces': result['filesToImport'],
  };
  window.electron.traceFileIO(request);
});

window.electron.receive('export-location-complete', (result) => {
  if (result.length === 0) {
    return;
  }

  const request = {
    'type': 'export',
    'traces': result['traces'],
    'outputDest': result['outputDest'],
  };

  if (result.hasOwnProperty('traceId')) {
    request['traceId'] = result['traceId'];
  } else if (result.hasOwnProperty('traces')) {
    request['traces'] = result['traces'];
  }

  window.electron.traceFileIO(request);
});

window.electron.receive('trace-io-complete', (result) => {
  switch (result['type']) {
    case 'create':
      saveTraceCompletion(result);
      break;
    case 'export':
      exportTraceCompletion(result);
      break;
    case 'import':
      importTraceCompletion(result);
      break;
    case 'read':
      loadTraceCompletion(result);
      break;
    case 'readall':
      displayTraces(result);
      break;
    case 'update':
      if (result['status'] !== 'ok') {
        showToast('Updating unsuccessful', false);
      } else {
        showToast('Updating successful', true);
      }
      // FIXME: lazy - update particular row, not refresh the entire list
      window.electron.traceFileIO({
        'type': 'readall',
        'index': result['index'],
      });
      break;
    case 'delete':
      // FIXME: lazy - remove particular row, not refresh the entire list
      window.electron.traceFileIO({
        'type': 'readall',
        'index': result['index'],
      });
      break;
    default:
      console.error(`Unknown type ${result['type']}`);
      break;
  }
});

function exportTraceCompletion(result) {
  if (result['status'] === 'ok') {
    showToast('Exporting successful', true);
  } else if (result['exportResult'].status === 'error') {
    // FIXME: clearer failure description - also, how to resolve?
    showToast('There was a problem exporting', false);
  }
}

function importTraceCompletion(result) {
  if (result['status'] === 'ok') {
    showToast('Importing successful', true);
    // FIXME: append new entries to bottom of the list, not refresh the entire list
    const request = {
      'type': 'readall',
      'index': result['index'],
    };
    window.electron.traceFileIO(request);
  } else {
    // FIXME: clearer failure description - also, how to resolve?
    showToast('There was a problem importing', false);
  }
}
window.addEventListener('resize', () => {
  adjustPlotlyGraph();
});

