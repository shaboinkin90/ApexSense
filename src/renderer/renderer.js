let tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
let tooltipList = [...tooltipTriggerList].map(tooltipTrigger => new bootstrap.Tooltip(tooltipTrigger, {
  // https://stackoverflow.com/a/67622885/1452175
  // https://getbootstrap.com/docs/5.3/components/tooltips/#options
  container: 'body',
  trigger: 'hover'
}));

function refreshTooltip() {
  tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  tooltipList = [...tooltipTriggerList].map(tooltipTrigger => new bootstrap.Tooltip(tooltipTrigger, {
    container: 'body',
    trigger: 'hover'
  }));
}

function toggleElementVisibility(isEnable, elementList) {
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

toggleElementVisibility(false, [headerCompareButtons, headerSyncToggles]);

const minusBtn = document.getElementById('minus-button').addEventListener('click', () => {
  removeRow();
});

const plusBtn = document.getElementById('plus-button').addEventListener('click', () => {
  addRow();
});

// Sync graph views 
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

// Overlay graphs
const overlayCheckBtn = document.getElementById('overlay-traces-checkbox');
overlayCheckBtn.addEventListener('click', () => {
  if (overlayCheckBtn.checked) {
    addOverlayTraces(rowUIElementMap);
  } else {
    removeOverlayTraces(rowUIElementMap);
  }
});

function addOverlayTraces(rowMap) {
  rowMap.forEach((row, index) => {
    let tracesToApply = [];

    rowUIElementMap.forEach((rowIter, indexIter) => {
      if (indexIter === index || rowIter['dataStash'] === null) {
        return;
      }

      const title = (rowIter['dataStash'].data.title) ? rowIter['dataStash'].data.title : `Row ${indexIter}`;
      const trace = rowIter['dataStash'].data.trace;
      tracesToApply.push({
        'title': title,
        'trace': trace
      });
    });

    row['gForcePlot'].overlayTraces(tracesToApply);
  });
}

// Remove all overlaid traces
function removeOverlayTraces(rowMap) {
  rowMap.forEach((row, _index) => {
    row['gForcePlot'].removeOverlaidTraces();
  });
}

// MAIN-CONTENT
function landingViewTransistion() {
  document.getElementById('landing-view').hidden = true;
  toggleElementVisibility(true, [headerCompareButtons]);
  const rootDiv = document.getElementById('main-content');
  rootDiv.hidden = false;
  buildRow(rootDiv, 1);
}

document.getElementById('get-started-btn').addEventListener('click', () => {
  landingViewTransistion();
});

// SAVING UI/Action
const saveTrimCard = document.getElementById('save-trim-element');
const commitSaveTrimBtn = document.getElementById('commit-save-trim-button');
const cancelSaveTrimBtn = document.getElementById('cancel-save-trim-button');
// duplicated code with a minor difference, could be streamlined
function saveTrimAction() {
  if (!saveTrimCard.hasAttribute('save-event-row-id')) {
    console.error('No id to reference while saving');
    return;
  }

  const label = document.getElementById('form-trim-title');
  if (label.value.trim() === '') {
    const errorMessage = "Please provide a label for the trim.";
    label.style.border = "2px solid red";
    alert(errorMessage);
    return;
  }

  const rowIndex = saveTrimCard.getAttribute('save-event-row-id');

  const uiElements = rowUIElementMap.get(parseInt(rowIndex, 10));
  // This needs a better check but essentially if there is no record of this 
  // trace having already been saved, we need to tell the user to save the trace first
  // though a better way would be to save the trace for them on their behalf
  // like a "This trace has not been saved, we'll save it for you" type of thing
  const jsonPath = uiElements['dataStash'].data.jsonPath;
  const trimRange = uiElements['trimBounds'];
  const saveTrimRequest = {
    'type': 'update',
    'index': rowIndex,
    'label': label.value,
    'jsonPath': jsonPath,
    'trimRange': trimRange,
  };
  saveTrimCard.removeAttribute('save-event-row-id');
  window.electron.traceFileIO(saveTrimRequest);
}

commitSaveTrimBtn.addEventListener('click', () => {
  saveTrimAction();
});

cancelSaveTrimBtn.addEventListener('click', () => {
  saveTrimCard.removeAttribute('save-event-row-id');
  saveTrimCard.hidden = true;
});

function saveTrimCompletion(result) {
  saveTrimCard.hidden = true;
  const label = document.getElementById('form-trim-title');
  label.value = '';
  const views = document.querySelectorAll('.fade-overlay')
  views.forEach(view => {
    view.hidden = true;
  });

  const uiElements = rowUIElementMap.get(parseInt(result['index'], 10));
  const trimSelector = uiElements['leftColumn'].trimVideo.trimControl.trimSelector;
  const trimDeleteBtn = uiElements['leftColumn'].trimVideo.trimControl.trimDeleteBtn;

  uiElements['dataStash'].trim = result['trim'];
  const trimRegionList = result['trim'];
  buildSelectorTrimList(trimSelector, trimRegionList);
  toggleElementVisibility(true, [trimDeleteBtn]);
  if (result['status'] === 'ok') {
    showToast('Trim saved', true);
  } else {
    showToast('There was a problem saving the trim', false);
    // FIXME: error handling
  }
}

function deleteTrimCompletion(result) {
  // on completion, remove from list, reset graph, reset video, reset selector, reset slider if enabled
  const uiElements = rowUIElementMap.get(parseInt(result['index'], 10));
  const trimSelector = uiElements['leftColumn'].trimVideo.trimControl.trimSelector;
  const trimDeleteBtn = uiElements['leftColumn'].trimVideo.trimControl.trimDeleteBtn;
  toggleElementVisibility(false, [trimDeleteBtn]);

  uiElements['dataStash'].trim = result['trim'];
  const trimRegionList = result['trim'];
  buildSelectorTrimList(trimSelector, trimRegionList);
  if (result['status'] === 'ok') {
    showToast('Trim deleted', true);
  } else {
    showToast('There was a problem deleting the selected trim', false);
    // FIXME: error handling
  }
}

const saveTraceCard = document.getElementById('save-card-element');
const commitSaveTraceBtn = document.getElementById('commit-save-button');
const cancelSaveTraceBtn = document.getElementById('cancel-save-button');
function saveTraceAction() {
  if (!saveTraceCard.hasAttribute('save-event-row-id')) {
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

  const rowIndex = saveTraceCard.getAttribute('save-event-row-id');
  const uiElements = rowUIElementMap.get(parseInt(rowIndex, 10));

  const shouldCacheVideo = document.getElementById('store-video-checkbox').checked;
  const videoPath = uiElements['dataFilePaths'].videoPath;
  const jsonPath = uiElements['dataFilePaths'].traceJsonPath;
  const saveTraceRequest = {
    'type': 'create',
    'index': rowIndex,
    'title': title.value,
    'cacheVideo': shouldCacheVideo,
    'videoPath': videoPath,
    'jsonPath': jsonPath,
  }
  saveTraceCard.removeAttribute('save-event-row-id');
  window.electron.traceFileIO(saveTraceRequest);
}

commitSaveTraceBtn.addEventListener('click', () => {
  saveTraceAction();
});

function saveTraceCompletion(results) {
  saveTraceCard.hidden = true;

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
  saveTraceCard.removeAttribute('save-event-row-id');
  saveTraceCard.hidden = true;
  const views = document.querySelectorAll('.fade-overlay')
  views.forEach(view => {
    view.style.display = 'none';
  });
}

cancelSaveTraceBtn.addEventListener('click', () => {
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
    uiElements['dataFilePaths'].videoPath = videoPath;
    window.electron.runPythonScript('garmincatalyst', videoPath, rowIndex);
  }
}

// split up
// - get UI entry 
// - get graph data
// - setup UI
function setupRowForGraph(result) {
  const uiElements = rowUIElementMap.get(result['index']);
  if (!uiElements) {
    console.error(`No UI entry for ${index}?`);
    for (const [key, value] of rowUIElementMap.entries()) {
      console.error(key, value);
    }
    showToast('There was a problem displaying this trace', false);
    return;
  }

  const title = ('title' in result['data']) ? result['data'].title : null;
  uiElements['dataStash'] = {
    'data': result['data'],
    'trim': result['trim'],
    'type': result['type']
  };

  const leftColumn = uiElements['leftColumn'];
  const rightColumn = uiElements['rightColumn'];
  const gForcePlot = uiElements['gForcePlot'];

  const graphParams = {
    'view': '3d',
    'fps': result['data'].fps,
    'trace': result['data'].trace,
    'title': title,
  };
  gForcePlot.prepareGraphs(graphParams);
  gForcePlot.viewGraph('3d');

  if (result['type'] === 'read') {
    loadView.hidden = true;
    document.getElementById('main-content').hidden = false;

    // loading a trace requires setting the video player up
    // processing a new video does this before processing starts
    leftColumn['dropZoneContainer'].container.hidden = true;
    leftColumn['videoContainer'].container.hidden = false;
    leftColumn['videoContainer'].videoPlayer.src = result['data'].videoPath;
  }

  // toggle UI visibility
  const viewBtnGroup = leftColumn['viewToggleButtons'].buttonGroup;
  leftColumn['viewToggleButtons'].v3d.checked = true;
  leftColumn['viewToggleButtons'].v2d.checked = false;

  const saveBtn = leftColumn['crudButtons'].saveBtn;
  const videoControls = leftColumn['videoControls'].container;
  toggleElementVisibility(true, [saveBtn, viewBtnGroup, videoControls, headerSyncToggles]);

  if (leftColumn['videoContainer'].videoPlayer.hasAttribute('plotly-paused')) {
    leftColumn['videoContainer'].videoPlayer.removeAttribute('plotly-paused');
  }

  rightColumn['loadingSpinner'].hidden = true;
  rightColumn['plotly'].top.hidden = false;
  rightColumn['plotly'].bottom.hidden = true;

  uiElements['dataFilePaths'].traceJsonPath = result['data'].jsonPath;
  rightColumn['plotly'].top.setAttribute('has-data', '');
  rightColumn['plotly'].bottom.removeAttribute('has-data');

  if (overlayCheckBtn.checked) {
    removeOverlayTraces(rowUIElementMap);
    addOverlayTraces(rowUIElementMap);
  }

  const sliderMin = 1;
  const sliderMax = result['data'].trace.length;
  const trimToggleSwitch = leftColumn['trimVideo'].toggle.input;
  const trimToggleLabel = leftColumn['trimVideo'].toggle.label;
  const trimSelector = leftColumn['trimVideo'].trimControl.trimSelector;
  const trimRegionList = uiElements['dataStash'].trim;
  const trimDeleteBtn = leftColumn['trimVideo'].trimControl.trimDeleteBtn;

  buildSelectorTrimList(trimSelector, trimRegionList);
  if (trimRegionList.length > 0) {
    // start at begnning
    trimSelector.selectedIndex = 0;
  }

  toggleElementVisibility(true, [trimToggleLabel, trimToggleSwitch]);

  const trimSlider = uiElements['leftColumn'].trimVideo.trimControl.trimSlider;
  trimSlider.noUiSlider.updateOptions({
    start: [sliderMax * 0.2, sliderMax * 0.8],
    range: {
      'min': sliderMin,
      'max': sliderMax,
    },
  });

  trimToggleSwitch.checked = false;
  toggleElementVisibility(true, [trimToggleSwitch, trimToggleLabel]);
  toggleElementVisibility(false, [trimSlider]);

  adjustPlotlyGraph();
}

window.electron.receive('python-complete', (result) => {
  const status = result['status'];
  switch (status) {
    case 'ok':
      setupRowForGraph(result);
      break;
    case 'unsupported-type':
      showToast('Unsupported operation', false);
      break;
    case 'no-python-found':
      showToast('Python was not detected on the system', false);
      break;
    case 'python-runtime-error':
      showToast('There was a problem processing the video', false);
      break;
    case 'invalid-result-data':
      showToast('There was a problem reading the processed results', false);
      break;
    default:
      console.error(`Unknown error in python-complete: ${status}`);
      break;
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
      setupRowForGraph(result);
      break;
    case 'readall':
      if ('overlay' in result) {
        displayOverlayTraces(result)
      } else {
        displayTraces(result);
      }
      break;
    case 'update':
      if (result['action'] === 'save-trim') {
        saveTrimCompletion(result);
      } else if (result['action'] === 'title' || result['action'] === 'video') {
        updateTraceCompletion(result);
      }
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

function updateTraceCompletion(result) {
  if (result['status'] !== 'ok') {
    showToast('Update unsuccessful', false);
  } else {
    showToast('Update successful', true);
  }
  // FIXME: lazy - update particular row, not refresh the entire list
  window.electron.traceFileIO({
    'type': 'readall',
    'index': result['index'],
  });

}

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

