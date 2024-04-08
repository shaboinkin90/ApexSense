function removeRow() {
  const rowItems = document.getElementsByClassName('row-item');
  let viewCount = rowItems.length;

  if (viewCount > 1) {
    viewCount -= 1;
  } else {
    return;
  }

  if (viewCount === 1) {
    toggleElementVisibility(false, [headerSyncToggles]);
    syncVideoPlaybackCheckBtn.checked = false;
    syncGraphViewCheckBtn.checked = false;
    if (overlayCheckBtn.checked) {
      removeOverlayTraces(rowUIElementMap);
      overlayCheckBtn.checked = false;
    }
  }

  const numTraceLabel = document.getElementById('num-traces-label');
  numTraceLabel.textContent = `${viewCount} Trace${viewCount > 1 ? 's' : ''}`;

  const rootDiv = document.getElementById('main-content');
  const lastChildIndex = rootDiv.childElementCount - 1;
  const lastChild = rootDiv.children[lastChildIndex];

  const regex = /\d+/;
  const match = lastChild.id.match(regex);

  if (match) {
    const mapKey = parseInt(match[0]);
    if (overlayCheckBtn.checked && viewCount !== 1) {
      // iterate and remove from other rows
      rowUIElementMap.forEach((row, index) => {
        if (mapKey == index) {
          return;
        }
        row['gForcePlot'].removeOverlaidTraces(mapKey);
      });
    }
    rowUIElementMap.delete(mapKey);
  } else {
    console.error(`${lastChild.id} malformed!`);
    return;
  }

  rootDiv.removeChild(lastChild)
  adjustRowItemHeights(rootDiv);
}

function removeSpecificOverlayFromRows(rowMap, indexToRemove) {
  rowMap.forEach((row, index) => {
    if (indexToRemove == index) {
      return;
    }
    row['gForcePlot'].removeOverlaidTraces(indexToRemove);
  });
}

function addRow() {
  const rowItems = document.getElementsByClassName('row-item');
  let viewCount = rowItems.length;

  // TODO: this could be more, no reason to limit it, make an option?
  // Though I'd rather have a better UI design for allowing multiple comparisons.
  // On my displays, I don't have the screen real estate to see more than 2 traces at once. 
  // Making video and graph smaller than what is currently implemented is sorta difficult.
  if (viewCount === 10) {
    return;
  }

  viewCount += 1;
  if (viewCount > 1) {
    toggleElementVisibility(true, [headerSyncToggles]);
  }

  const numTraceLabel = document.getElementById('num-traces-label');
  numTraceLabel.textContent = `${viewCount} Traces`;

  const rootDiv = document.getElementById('main-content');
  buildRow(rootDiv, viewCount);
}

function buildRow(rootDiv, rowIndex) {
  const rowItem = document.createElement('div');
  rowItem.className = 'row-item';
  rowItem.id = `row-${rowIndex}`;

  const leftColumn = buildLeftColumn(rowIndex);
  const rightColumn = buildRightColumn(rowIndex);
  const gForcePlot = new GForcePlot({
    'graphDivs': {
      'top': rightColumn['plotly'].top,
      'bottom': rightColumn['plotly'].bottom,
    },
    'videoPlayer': leftColumn['videoContainer'].videoPlayer,
    'syncCallback': syncCameras,
  });

  rowUIElementMap.set(rowIndex, {
    'rowItem': rowIndex,
    'leftColumn': leftColumn,
    'rightColumn': rightColumn,
    'gForcePlot': gForcePlot,
    'rawDataStash': null,
    'dataFilePaths': {
      'traceJsonPath': '',
      'videoPath': ''
    },
  });

  applyEventListeners(rowIndex, leftColumn, rightColumn, gForcePlot);

  rowItem.appendChild(leftColumn.column);
  rowItem.appendChild(rightColumn.column);
  rootDiv.appendChild(rowItem);

  adjustRowItemHeights(rootDiv);
  refreshTooltip();
}

function buildLeftColumn(rowIndex) {
  const leftColumn = document.createElement('div');
  leftColumn.classList.add('left-column');

  // crud buttons
  const buttonsRow = document.createElement('div');
  buttonsRow.classList.add('buttons-row');

  function createButton(href, btnClass, dataBsLabel, xlinkHref) {
    const a = document.createElement('a');
    a.href = href;
    a.classList.add('btn', 'm-1');
    if (btnClass !== null) {
      a.classList.add(btnClass);
    }

    if (dataBsLabel !== null) {
      a.setAttribute('data-bs-toggle', 'tooltip');
      a.setAttribute('data-bs-placement', 'bottom');
      a.setAttribute('data-bs-title', dataBsLabel);
      a.setAttribute('data-bs-delay', '{"show": "500", "hide": "250"}')
    }

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('bi');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');

    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', xlinkHref);

    svg.appendChild(use);
    a.appendChild(svg);

    return a;
  }

  const newBtn = createButton('#', 'btn-success', 'New', '#new');
  const saveBtn = createButton('#', 'btn-primary', 'Save', '#save');
  const loadBtn = createButton('#', 'btn-secondary', 'Load', '#load');

  const dividerLeft = document.createElement('div');
  dividerLeft.classList.add('vertical-divider');

  const viewButtonGroup = document.createElement('div');
  viewButtonGroup.classList.add('btn-group', 'apex-graph-view-buttons');
  viewButtonGroup.setAttribute('role', 'group');

  const input3D = document.createElement('input');
  input3D.type = 'radio';
  input3D.classList.add('btn-check');
  input3D.name = `btn-view-${rowIndex}`;
  input3D.id = `btn-view-3d-${rowIndex}`;
  input3D.checked = true;

  const label3D = document.createElement('label');
  label3D.classList.add('btn', 'btn-outline-light');
  label3D.setAttribute('for', input3D.id);
  label3D.textContent = '3D';

  const input2D = document.createElement('input');
  input2D.type = 'radio';
  input2D.classList.add('btn-check');
  input2D.name = `btn-view-${rowIndex}`;
  input2D.id = `btn-view-2d-${rowIndex}`;

  const label2D = document.createElement('label');
  label2D.classList.add('btn', 'btn-outline-light');
  label2D.setAttribute('for', input2D.id);
  label2D.textContent = '2D';

  viewButtonGroup.appendChild(input3D);
  viewButtonGroup.appendChild(label3D);
  viewButtonGroup.appendChild(input2D);
  viewButtonGroup.appendChild(label2D);

  const dividerRight = document.createElement('div');
  dividerRight.className = 'vertical-divider';

  const videoControls = document.createElement('div');
  videoControls.className = 'video-controls';

  const playPauseButton = createButton('#', null, null, '#play');
  const stopButton = createButton('#', null, null, '#stop');
  const audioButton = createButton('#', null, null, '#audio-off');

  videoControls.appendChild(playPauseButton);
  videoControls.appendChild(stopButton);
  videoControls.appendChild(audioButton);

  buttonsRow.appendChild(newBtn);
  buttonsRow.appendChild(saveBtn);
  buttonsRow.appendChild(loadBtn);
  buttonsRow.appendChild(dividerLeft);
  buttonsRow.appendChild(viewButtonGroup);
  buttonsRow.appendChild(dividerRight);
  buttonsRow.appendChild(videoControls);

  // Drop zone container
  const dropZoneContainer = document.createElement('div');
  dropZoneContainer.classList.add('drop-zone-container');

  const dropZone = document.createElement('div');
  dropZone.classList.add('drop-zone');
  dropZone.setAttribute('type', 'file');
  dropZone.setAttribute('accept', '.mp4');
  dropZone.textContent = 'Drag and drop Garmin Catalyst video here';

  const selectVideoButton = document.createElement('button');
  selectVideoButton.type = 'button';
  selectVideoButton.classList.add('btn', 'btn-light');
  selectVideoButton.textContent = 'Select video';

  dropZone.appendChild(selectVideoButton);
  dropZoneContainer.appendChild(dropZone);

  // Video container
  const videoContainer = document.createElement('div');
  videoContainer.classList.add('video-container');
  videoContainer.hidden = true;

  const videoPlayer = document.createElement('video');
  videoPlayer.classList.add('video-player');
  videoPlayer.id = `video-${rowIndex}`;
  videoPlayer.controls = false;

  // row -> 
  //  col -> trim button
  //  col -> slider
  //  col -> toggle
  const trimRowDiv = document.createElement('div');
  trimRowDiv.classList.add('row', 'justify-content-center', 'w-100');
  const trimBtnsCol = document.createElement('div');
  trimBtnsCol.classList.add('trim-btns-col', 'col');

  const trimBackBtn = document.createElement('button');
  trimBackBtn.classList.add('btn', 'btn-outline-secondary', 'trim-btns');
  trimBackBtn.textContent = 'Reset Trim';

  const commitTrimBtn = document.createElement('button');
  commitTrimBtn.classList.add('btn', 'btn-light', 'trim-btns');
  commitTrimBtn.textContent = 'Trim Region';
  commitTrimBtn.setAttribute('data-bs-title', 'Drag the sliders to specify the range to trim');
  commitTrimBtn.setAttribute('data-bs-toggle', 'tooltip');
  commitTrimBtn.setAttribute('data-bs-delay', '{"show":"500", "hide":"250"}');
  commitTrimBtn.setAttribute('hide', '250');
  commitTrimBtn.setAttribute('data-bs-placement', 'top');

  const trimSaveBtn = document.createElement('button');
  trimSaveBtn.classList.add('btn', 'btn-outline-primary', 'trim-btns');
  trimSaveBtn.textContent = 'Save Trim';

  const trimDeleteBtn = document.createElement('button');
  trimDeleteBtn.classList.add('btn', 'btn-outline-secondary', 'trim-btns');
  trimDeleteBtn.textContent = 'Delete Trim';
  trimDeleteBtn.setAttribute('data-bs-title', 'Select the trim to delete from the list below');
  trimDeleteBtn.setAttribute('data-bs-toggle', 'tooltip');
  trimDeleteBtn.setAttribute('data-bs-delay', '{"show":"500", "hide":"250"}');
  trimDeleteBtn.setAttribute('hide', '250');
  trimDeleteBtn.setAttribute('data-bs-placement', 'top');


  const trimSelector = document.createElement('select');
  trimSelector.classList.add('form-select', 'm-1', 'mb-3');
  trimSelector.style = 'width: 95%';
  buildSelectorTrimList(trimSelector);

  trimBtnsCol.appendChild(trimBackBtn);
  trimBtnsCol.appendChild(commitTrimBtn);
  trimBtnsCol.appendChild(trimSaveBtn);
  trimBtnsCol.appendChild(trimDeleteBtn);

  toggleElementVisibility(false, [trimBackBtn, commitTrimBtn, trimSaveBtn, trimDeleteBtn, trimSelector]);

  trimRowDiv.appendChild(trimBtnsCol);
  trimRowDiv.appendChild(trimSelector);

  const trimSlider = document.createElement('div');
  trimSlider.id = `trim-${rowIndex}`;
  trimSlider.classList.add('video-trim-slider');
  noUiSlider.create(trimSlider, {
    // Default values until a video is provided
    start: [20, 80],
    connect: true,
    range: {
      'min': 0,
      'max': 100,
    },
  });
  toggleElementVisibility(false, [trimSlider]);

  trimRowDiv.appendChild(trimSlider);

  const trimVideoToggleDiv = document.createElement('div');
  trimVideoToggleDiv.classList.add('form-check', 'form-switch', 'trim-toggle-btn-row');

  const trimToggleInput = document.createElement('input');
  trimToggleInput.classList.add('form-check-input');
  trimToggleInput.type = 'checkbox';
  trimToggleInput.role = 'switch';
  trimToggleInput.id = 'trim-video-toggle';
  trimToggleInput.setAttribute('data-bs-title', 'Click to enable zooming in on a specific area on the G-force plot');
  trimToggleInput.setAttribute('data-bs-toggle', 'tooltip');
  trimToggleInput.setAttribute('data-bs-delay', '{"show":"500", "hide":"250"}');
  trimToggleInput.setAttribute('hide', '250');
  trimToggleInput.setAttribute('data-bs-placement', 'bottom');

  const trimToggleLabel = document.createElement('label');
  trimToggleLabel.classList.add('form-check-label');
  trimToggleLabel.setAttribute('for', 'trim-video-toggle');
  trimToggleLabel.textContent = 'Trim video mode';
  toggleElementVisibility(false, [trimToggleInput, trimToggleLabel]);

  trimVideoToggleDiv.appendChild(trimToggleInput);
  trimVideoToggleDiv.appendChild(trimToggleLabel);

  trimRowDiv.appendChild(trimVideoToggleDiv);

  videoContainer.appendChild(videoPlayer);

  leftColumn.appendChild(buttonsRow);
  leftColumn.appendChild(dropZoneContainer);
  leftColumn.appendChild(videoContainer);
  leftColumn.appendChild(trimRowDiv);

  // Default disabling controls that aren't useable until graphs appear
  toggleElementVisibility(false, [saveBtn, viewButtonGroup, videoControls]);

  const columnContents = {
    'column': leftColumn,
    'crudButtons': {
      'newBtn': newBtn,
      'saveBtn': saveBtn,
      'loadBtn': loadBtn,
    },
    'viewToggleButtons': {
      'buttonGroup': viewButtonGroup,
      'v3d': input3D,
      'v2d': input2D,
    },
    'videoControls': {
      'container': videoControls,
      'playPause': playPauseButton,
      'stop': stopButton,
      'audio': audioButton,
    },
    'dropZoneContainer': {
      'container': dropZoneContainer,
      'dropZone': dropZone,
      'selectVideoButton': selectVideoButton,
    },
    'videoContainer': {
      'container': videoContainer,
      'videoPlayer': videoPlayer,
    },
    'trimVideo': {
      'toggle': {
        'div': trimVideoToggleDiv,
        'input': trimToggleInput,
        'label': trimToggleLabel,
      },
      'trimControl': {
        'trimBackBtn': trimBackBtn,
        'trimCommitBtn': commitTrimBtn,
        'trimSaveBtn': trimSaveBtn,
        'trimDeleteBtn': trimDeleteBtn,
        'trimSelector': trimSelector,
        'trimSlider': trimSlider,
      },
    },
  };
  return columnContents;
}

function buildRightColumn(rowIndex) {
  const rightColumn = document.createElement('div');
  rightColumn.className = 'right-column';

  // Progress spinner
  const loadingSpinner = document.createElement('div');
  loadingSpinner.className = 'loading-spinner';
  loadingSpinner.hidden = true;

  const spinnerBorder = document.createElement('div');
  spinnerBorder.className = 'spinner-border mb-2 progress-spinner-style';
  loadingSpinner.appendChild(spinnerBorder);

  const statusText = document.createElement('strong');
  statusText.setAttribute('role', 'status');
  statusText.textContent = 'Please wait, processing video...';
  loadingSpinner.appendChild(statusText);

  const plotlyTop = document.createElement('div');
  plotlyTop.className = 'plotly';
  plotlyTop.id = `plotly-top-${rowIndex}`;
  plotlyTop.hidden = true;

  const plotlyBottom = document.createElement('div');
  plotlyBottom.className = 'plotly';
  plotlyBottom.id = `plotly-bottom-${rowIndex}`;
  // bottom is for 2d graph, hide by default
  plotlyBottom.hidden = true;

  // Camera view presets dropdown button. This only applies for 3d viewing. Hide otherwise
  const viewButtonGroup = document.createElement('div');
  viewButtonGroup.className = 'btn-group dropup camera-btn-container-layout m-2 ps-3';

  const dropDownButton = document.createElement('button');
  dropDownButton.className = 'btn btn-secondary dropdown-toggle';
  dropDownButton.setAttribute('data-bs-toggle', 'dropdown');
  dropDownButton.textContent = 'Camera angles';

  const dropDownMenu = document.createElement('ul');
  dropDownMenu.className = 'dropdown-menu';

  const labels = ['Front', 'Back', 'Corner', 'Accel', 'Iso'];
  labels.forEach(label => {
    const listItem = document.createElement('li');
    const item = document.createElement('a');
    item.className = 'dropdown-item';
    item.href = '#';
    item.textContent = label;
    listItem.appendChild(item);
    dropDownMenu.appendChild(listItem);
  });

  viewButtonGroup.appendChild(dropDownButton);
  viewButtonGroup.appendChild(dropDownMenu);

  // Darkening overlay when saving
  const fadeOverlayTop = document.createElement('div');
  fadeOverlayTop.className = 'fade-overlay';
  fadeOverlayTop.hidden = true;

  plotlyTop.appendChild(viewButtonGroup);
  plotlyTop.appendChild(fadeOverlayTop);

  const fadeOverlayBottom = document.createElement('div');
  fadeOverlayBottom.className = 'fade-overlay';
  fadeOverlayBottom.hidden = true;

  plotlyBottom.appendChild(fadeOverlayBottom);

  rightColumn.appendChild(loadingSpinner);
  rightColumn.appendChild(plotlyTop);
  rightColumn.appendChild(plotlyBottom);

  const columnContents = {
    'column': rightColumn,
    'loadingSpinner': loadingSpinner,
    'plotly': {
      'top': plotlyTop,
      'bottom': plotlyBottom,
    },
    'viewButtons': {
      'viewButtonGroup': viewButtonGroup,
      'dropDownMenu': dropDownMenu,
      'dropDownButton': dropDownButton
    },
  };
  return columnContents;
}

function buildSelectorTrimList(trimSelector, trimRegionList) {
  trimSelector.innerHTML = '';
  const defaultSelectorOption = document.createElement('option');
  defaultSelectorOption.textContent = 'Select Trimmed Region';
  defaultSelectorOption.value = '';
  defaultSelectorOption.selected = true;
  defaultSelectorOption.disabled = true;
  trimSelector.appendChild(defaultSelectorOption);

  if (trimRegionList && trimRegionList.length > 0) {
    trimRegionList.forEach(trimRegion => {
      if (!trimRegion.range) {
        return;
      }
      const option = document.createElement('option');
      option.value = JSON.stringify(trimRegion);
      option.textContent = trimRegion.label;
      trimSelector.appendChild(option);
    });
    toggleElementVisibility(true, [trimSelector]);
    // new entries always added to bottom of list, default to the newly added option
    trimSelector.selectedIndex = trimRegionList.length; // 1-based index due to default option at index 0
  } else {
    toggleElementVisibility(false, [trimSelector]);
  }
}

function resetTrimElements(rowEntry) {
  const trimToggleSwitch = leftColumn['trimVideo'].toggle.input;
  const trimToggleLabel = leftColumn['trimVideo'].toggle.label;

  const trimBackBtn = leftColumn['trimVideo'].trimControl.trimBackBtn;
  const trimSaveBtn = leftColumn['trimVideo'].trimControl.trimSaveBtn;
  const trimDeleteBtn = leftColumn['trimVideo'].trimControl.trimDeleteBtn;
  const trimSelector = leftColumn['trimVideo'].trimControl.trimSelector;
  const trimCommitBtn = leftColumn['trimVideo'].trimControl.trimCommitBtn;
  const trimSlider = leftColumn['trimVideo'].trimControl.trimSlider;


}



// See comment above the video element event listeners.
// Could use a rethink of code structure
let videoSyncing = null;

function applyEventListeners(rowIndex, leftColumn, rightColumn, gForcePlot) {
  // Need the map entry to access the 'dataStash' stuff - would like to think of a better way
  const rowEntry = rowUIElementMap.get(rowIndex);
  if (!rowEntry) {
    console.error(`Row ${rowIndex} not found in rowUIElementMap!`);
    return;
  }
  // cruds
  {
    const newBtn = leftColumn['crudButtons'].newBtn;
    const saveBtn = leftColumn['crudButtons'].saveBtn;
    const loadBtn = leftColumn['crudButtons'].loadBtn;
    newBtn.addEventListener('click', () => {
      // Clear out UI
      leftColumn['videoContainer'].videoPlayer.pause();
      gForcePlot.clearGraphs();

      const playPauseBtn = leftColumn['videoControls'].playPause;
      changeSvgIcon(playPauseBtn, '#play');

      const audioBtn = leftColumn['videoControls'].audio;
      changeSvgIcon(audioBtn, '#audio-off');

      leftColumn['videoContainer'].videoPlayer.src = '';
      // setting src to '' leads to a consistent stream of 
      // !! Video video-1 error MEDIA_ELEMENT_ERROR: Empty src attribute !!
      // errors in the console. Remove the attribute stops errors.
      leftColumn['videoContainer'].videoPlayer.removeAttribute('src');
      leftColumn['videoContainer'].videoPlayer.muted = false;
      leftColumn['videoContainer'].container.hidden = true;

      leftColumn['dropZoneContainer'].container.hidden = false;

      leftColumn['viewToggleButtons'].v3d.checked = true;
      leftColumn['viewToggleButtons'].v2d.checked = false;
      leftColumn['trimVideo'].toggle.input.checked = false;
      const trimSlider = leftColumn['trimVideo'].trimControl.trimSlider;
      const trimToggleInput = leftColumn['trimVideo'].toggle.input;
      const trimToggleLabel = leftColumn['trimVideo'].toggle.label;
      const trimSelector = leftColumn['trimVideo'].trimControl.trimSelector;
      buildSelectorTrimList(trimSelector);
      trimSlider.noUiSlider.updateOptions({
        // Default values until a video is provided
        start: [20, 80],
        connect: true,
        range: {
          'min': 0,
          'max': 100,
        },
      });

      const viewBtns = leftColumn['viewToggleButtons'].buttonGroup;
      const videoControls = leftColumn['videoControls'].container;

      toggleElementVisibility(false, [trimSelector, trimSlider, trimToggleInput, trimToggleLabel,
        saveBtn, viewBtns, videoControls]);

      rightColumn['plotly'].top.hidden = true;
      rightColumn['plotly'].bottom.hidden = true;

      rowEntry['rawDataStash'] = null;
      rowEntry['dataFilePaths'].traceJsonPath = '';
      rowEntry['dataFilePaths'].videoPath = '';

      removeOverlayTraces(rowUIElementMap);
      addOverlayTraces(rowUIElementMap);
    });

    saveBtn.addEventListener('click', () => {
      // dim, present card
      const dimViews = document.querySelectorAll('.fade-overlay');
      dimViews.forEach(view => {
        view.style.display = 'block';
        view.hidden = false;
      });
      saveTraceCard.hidden = false;
      document.getElementById('form-trace-title').textContent = '';
      // pass in the index to the save card element as an attribute so it knows where to get the required
      // information from
      saveTraceCard.setAttribute('save-event-row-id', rowIndex);
    });
    loadBtn.addEventListener('click', () => {
      window.electron.traceFileIO({
        'type': 'readall',
        'index': rowIndex,
      });
    });
  }

  // 3d/2d view
  {
    const view3dBtn = leftColumn['viewToggleButtons'].v3d;
    const view2dBtn = leftColumn['viewToggleButtons'].v2d;
    view3dBtn.addEventListener('click', () => {
      rightColumn['plotly'].top.hidden = false;
      rightColumn['plotly'].bottom.hidden = true;
      rightColumn['viewButtons'].viewButtonGroup.hidden = false;
      rightColumn['plotly'].top.setAttribute('has-data', '');
      rightColumn['plotly'].bottom.removeAttribute('has-data');
      gForcePlot.viewGraph('3d');
      if (overlayCheckBtn.checked) {
        addOverlayTraces(rowUIElementMap);
      } else {
        removeOverlayTraces(rowUIElementMap);
      }
    });
    view2dBtn.addEventListener('click', () => {
      rightColumn['plotly'].top.hidden = false;
      rightColumn['plotly'].bottom.hidden = false;
      rightColumn['viewButtons'].viewButtonGroup.hidden = true;
      rightColumn['plotly'].top.setAttribute('has-data', '');
      rightColumn['plotly'].bottom.setAttribute('has-data', '');
      gForcePlot.viewGraph('2d');
      if (overlayCheckBtn.checked) {
        addOverlayTraces(rowUIElementMap);
      } else {
        removeOverlayTraces(rowUIElementMap);
      }
    });
  }

  // dropzone
  {
    const dropZone = leftColumn['dropZoneContainer'].dropZone;
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.style.backgroundColor = 'lightgray';
    });
    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.style.backgroundColor = '';
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.style.backgroundColor = '';
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const videoFile = files[0];
        if (videoFile.type === 'video/mp4') {
          // FIXME: check video dimensions are expected before starting. do in script, error with reason
          leftColumn['dropZoneContainer'].container.hidden = true;
          leftColumn['videoContainer'].container.hidden = false;
          leftColumn['videoContainer'].videoPlayer.src = URL.createObjectURL(videoFile);
          rightColumn['loadingSpinner'].hidden = false;

          processVideo(videoFile.path, rowIndex);
        } else {
          showToast('A .mp4 video file is required.', false);
        }
      }
    });
    const selectButton = leftColumn['dropZoneContainer'].selectVideoButton;
    selectButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.electron.openVideoDialogPrompt(rowIndex);
    });
  }
  // video
  /*
    There is what looks to be a bug in Apple ARM devices where seeking results in video decoder errors
    https://github.com/video-dev/hls.js/issues/3834
    https://bugs.chromium.org/p/chromium/issues/detail?id=1203822 

    As a result, there is some pretty ugly steps that I take to reduce the occurence of the errors.
    Attempting to tell multiple videos to seek at the same time seems to cause errors at higher rates, though
    even on a single video do I see video decoder errors pop up. 
    
    The jist is to serialize the video elements so only 1 video at a time is in the process of pausing or seeking.
    When multiple videos are present, at the occurence of the first video event to trigger an action, I build up a queue of video
    elements that need to change state.

    I had to make excessive use of attributes to deduce what particular state the video
    playback is in. I'm sure there's a cleaner way, but it's not important right now.
  */
  {
    const videoPlayer = leftColumn['videoContainer'].videoPlayer;
    const videoControls = leftColumn['videoControls'];
    const trimSelector = leftColumn['trimVideo'].trimControl.trimSelector;
    function removeVideoAttributes(videoPlayer) {
      videoPlayer.removeAttribute('video-error-reset');
      videoPlayer.removeAttribute('video-stopped');
      videoPlayer.removeAttribute('video-paused');
      videoPlayer.removeAttribute('plotly-paused');
      videoPlayer.removeAttribute('plotly-already-paused');
      videoPlayer.removeAttribute('trim-video-ended');
    }

    function resetVideoPlayerTime() {
      if (trimSelector.selectedIndex > 0) {
        const selectedEntry = JSON.parse(trimSelector.options[trimSelector.selectedIndex].value);
        const { startTime } = selectedEntry.range;
        videoPlayer.currentTime = startTime;
      } else {
        videoPlayer.currentTime = 0;
      }
      changeSvgIcon(videoControls.playPause, '#play');
    }

    videoControls.playPause.addEventListener('click', () => {
      debounce(async () => {
        removeVideoAttributes(videoPlayer);

        // pause video(s)
        if (isVideoPlaying(videoPlayer)) {
          if (shouldSyncVideos) {
            videoSyncing = new VideoSyncing(videoPlayer, false, 'pause');

            rowUIElementMap.forEach((value, _key) => {
              const rowVideoPlayer = value['leftColumn'].videoContainer.videoPlayer;
              const playPauseBtn = value['leftColumn'].videoControls.playPause;

              rowVideoPlayer.setAttribute('video-paused', '');
              changeSvgIcon(playPauseBtn, '#play');

              if (videoPlayer.id !== rowVideoPlayer.id) {
                // don't add trigger video as we'll serialize the sequence of pause()
                // Avoid any sort of concurrent interactions with video elements
                videoSyncing.addVideoToSyncingQueue(rowVideoPlayer);
              }
            });
          } else {
            changeSvgIcon(videoControls.playPause, '#play');
            videoPlayer.setAttribute('video-paused', '');
          }

          videoPlayer.pause();
        }
        // play video(s)
        else {
          if (shouldSyncVideos) {
            // If you pause during play, then click stop, we need to seek back to 0
            // calling play() once the video ended without seeking to 0 will implicitly `seek` to 0. We need 
            // to control this to limit video errors, otherwise all video elements will seek concurrently
            if (videoPlayer.hasAttribute('video-ended')) {

              videoPlayer.currentTime = 0;
              videoSyncing = new VideoSyncing(videoPlayer, false, 'play');

              // change icons, queue videos 
              rowUIElementMap.forEach((value, _key) => {
                const rowVideoPlayer = value['leftColumn'].videoContainer.videoPlayer;
                const playPauseBtn = value['leftColumn'].videoControls.playPause;
                changeSvgIcon(playPauseBtn, '#pause');

                rowVideoPlayer.removeAttribute('video-ended');
                if (videoPlayer.id === rowVideoPlayer.id) {
                  return;
                }
                videoSyncing.addVideoToSyncingQueue(rowVideoPlayer);
              });
            } else {
              // playing does not require sync queuing
              rowUIElementMap.forEach((value, _key) => {
                const rowVideoPlayer = value['leftColumn'].videoContainer.videoPlayer;
                const playPauseBtn = value['leftColumn'].videoControls.playPause;
                changeSvgIcon(playPauseBtn, '#pause');

                console.log(`video ${rowVideoPlayer.id} playing...`);
                rowVideoPlayer.play();
              });
            }
          } else {
            changeSvgIcon(videoControls.playPause, '#pause');
            videoPlayer.play()
          }
        }
      }, 100);
    });

    videoControls.stop.addEventListener('click', () => {
      debounce(() => {
        console.log(`${videoPlayer.id} stopping`);

        videoPlayer.setAttribute('video-stopped', '');
        changeSvgIcon(videoControls.playPause, '#play');

        if (isVideoPlaying(videoPlayer)) {
          videoPlayer.pause();
          resetVideoPlayerTime();

        } else {
          // playing -> pause btn -> stop btn
          // `pause` event is not triggered if already paused, so set time here
          resetVideoPlayerTime();
        }

        // stopping requires a pause and currentTime = 0. 
        // Set the video-stopped attribute here, and in `pause` event, set currentTime = 0
        // the `pause` event handles the videoSync creation
        if (shouldSyncVideos) {
          videoSyncing = new VideoSyncing(videoPlayer, false, 'stop');
          rowUIElementMap.forEach((value, _key) => {
            const rowVideoPlayer = value['leftColumn'].videoContainer.videoPlayer;
            if (rowVideoPlayer.id === videoPlayer.id) {
              return;
            }

            const playPauseBtn = value['leftColumn'].videoControls.playPause;
            changeSvgIcon(playPauseBtn, '#play');

            videoSyncing.addVideoToSyncingQueue(rowVideoPlayer);
          });
        }
      }, 100);
    });

    videoPlayer.addEventListener('pause', () => {
      console.debug(`${videoPlayer.id} - paused`);

      // `pause` triggers before `ended`. Don't do anything special here
      if (videoPlayer.currentTime === videoPlayer.duration) {
        removeVideoAttributes(videoPlayer);
        console.debug(`${videoPlayer.id} pause event AND video ended`);
        return;
      }

      if (videoPlayer.hasAttribute('video-paused') && shouldSyncVideos && videoSyncing) {
        const nextVideo = videoSyncing.getNextVideo();
        if (nextVideo === null) {
          // no more entries, syncing done
          videoSyncing = null;
          rowUIElementMap.forEach((value, _key) => {
            const rowVideoPlayer = value['leftColumn'].videoContainer.videoPlayer;
            rowVideoPlayer.removeAttribute('video-paused');
          });
          return;
        }
        nextVideo.pause();
        return;
      }

      if (videoPlayer.hasAttribute('plotly-paused') && shouldSyncVideos && videoSyncing === null) {
        // comes from plotly_click, trigger graph needs to tell other videos to pause, sync, then resume 
        const syncTime = parseFloat(videoPlayer.getAttribute('plotly-playback-time'));
        videoPlayer.currentTime = syncTime;
        videoSyncing = new VideoSyncing(videoPlayer, true, 'plotly-pause');
        rowUIElementMap.forEach((value, _key) => {
          const rowVideoPlayer = value['leftColumn'].videoContainer.videoPlayer;
          if (videoPlayer.id === rowVideoPlayer.id) {
            return;
          }
          rowVideoPlayer.setAttribute('plotly-paused', '');
          videoSyncing.addVideoToSyncingQueue(rowVideoPlayer);
        });
      }

      if (videoPlayer.hasAttribute('plotly-paused') && !shouldSyncVideos) {
        const syncTime = parseFloat(videoPlayer.getAttribute('plotly-playback-time'));
        if (!Number.isFinite(syncTime)) {
          console.error(`${videoPlayer.id} attempted to set bad time ${syncTime}`);
        }
        videoPlayer.removeAttribute('plotly-playback-time');
        if (syncTime)
          videoPlayer.currentTime = syncTime;
      }

      // stopping needs seek, on `canplay` after seek, check for syncing flag
      if (videoPlayer.hasAttribute('video-stopped')) {
        console.log(`${videoPlayer.id} has video-stopped. Time = 0`);
        resetVideoPlayerTime();
      }
    });

    videoPlayer.addEventListener('seeking', () => {
      console.debug(`${videoPlayer.id} - seeking\n` +
        `\tsync: ${shouldSyncVideos}\n` +
        `\tplotly-paused: ${videoPlayer.hasAttribute('plotly-paused')}\n` +
        `\tplotly-already-pausedd: ${videoPlayer.hasAttribute('plotly-already-paused')}\n` +
        `\tcurrentTime: ${videoPlayer.currentTime}` +
        `\tvideoSyncing === ${videoSyncing}`);
      if (videoSyncing) {
        console.debug(`\tvideoSyncing time === ${videoSyncing.timeToSyncTo}`);
      }

      // this happens if the video ends, then you try to seek somewhere else on the graph
      if (videoPlayer.hasAttribute('video-ended') && videoPlayer.currentTime !== 0 && videoPlayer.currentTime !== videoPlayer.duration) {
        videoPlayer.removeAttribute('video-ended');
      }

      // no pause event when clicking on the graph if the video is already paused, handle syncing here
      if (videoPlayer.hasAttribute('plotly-already-paused') && shouldSyncVideos && videoSyncing === null) {
        videoSyncing = new VideoSyncing(videoPlayer, false, 'plotly-already-paused');
        console.debug(`${videoPlayer.id} seeking requires new video sync - ${videoSyncing.timeToSyncTo}`);
        rowUIElementMap.forEach((value, _key) => {
          const rowVideoPlayer = value['leftColumn'].videoContainer.videoPlayer;
          if (videoPlayer.id === rowVideoPlayer.id) {
            return;
          }
          videoSyncing.addVideoToSyncingQueue(rowVideoPlayer);
        });
      }
    });

    videoPlayer.addEventListener('canplaythrough', () => {
      console.debug(`${videoPlayer.id} - canplaythrough`);
      if (videoSyncing) {
        console.debug(`videoSyncing state ${videoSyncing.state}`);
        const nextVideo = videoSyncing.getNextVideo();

        if (nextVideo === null) {
          if (videoSyncing.state === 'play' || videoSyncing.state === 'plotly-pause') {
            rowUIElementMap.forEach((value, _key) => {
              const rowVideoPlayer = value['leftColumn'].videoContainer.videoPlayer;
              rowVideoPlayer.play();
            });
          }
          videoSyncing = null;
          return;
        }

        if (videoSyncing.state === 'plotly-pause') {
          console.debug(`${nextVideo.id} next - plotly-paused - sync to ${videoSyncing.timeToSyncTo}`);
          nextVideo.pause();
          nextVideo.currentTime = videoSyncing.timeToSyncTo;
          return;
        }

        if (videoSyncing.state === 'plotly-already-paused') {
          console.debug(`${nextVideo.id} next - plotly-aleady-paused - sync to ${videoSyncing.timeToSyncTo}`);
          nextVideo.currentTime = videoSyncing.timeToSyncTo;
          console.debug(`${nextVideo.id} set to ${nextVideo.currentTime}`);
          return;
        }

        if (videoSyncing.state === 'stop') {
          nextVideo.pause();
          nextVideo.currentTime = videoSyncing.timeToSyncTo;
          return;
        }


        if (videoPlayer.hasAttribute('video-stopped') || videoSyncing.state === 'play') {
          nextVideo.pause();
          nextVideo.currentTime = 0;
          return;
        }

      } else {
        // clicking on the graph while actively playing needs a pause -> resume
        if (videoPlayer.hasAttribute('plotly-paused')) {
          videoPlayer.removeAttribute('plotly-paused');
          videoPlayer.play();
        }
      }
    });

    videoPlayer.addEventListener('playing', () => {
      console.debug(`${videoPlayer.id} - playing`);
      if (videoPlayer.hasAttribute('video-ended')) {
        console.warn(`${videoPlayer.id} has video-ended attrib during playing event.`);
        videoPlayer.removeAttribute('video-ended');
      }
    });


    videoPlayer.addEventListener('ended', () => {
      console.debug(`${videoPlayer.id} - ended`);
      changeSvgIcon(videoControls.playPause, '#play');
      removeVideoAttributes(videoPlayer);

      // when ended, on pressing play again, the video element will automatically attempt to seek
      // we need to handle this so multiple seeks don't fire at the same time otherwise
      // the PIPELINE_ERORR_DECODE error will be raise. 
      videoPlayer.setAttribute('video-ended', '');
    });

    // When updating the currentTime of videos while syncing, 
    // somewhat frequenctly, an error of "PIPELINE_ERROR_DECODE: VDA Error 4" 
    // is generated on Apple ARM.
    // As a work around, store the current playback, reload the video and reset the current time.
    // This causes the video player to flash, but I can live it that. 
    videoPlayer.addEventListener('error', () => {
      console.error(`!! Video ${videoPlayer.id} error ${videoPlayer.error.message} !!\n`);
      videoPlayer.setAttribute('video-error-reset', '');
      if (shouldSyncVideos) {
        if (videoSyncing) {
          videoPlayer.load();
          console.warn(`${videoPlayer.id} error reload, sync time is ${videoSyncing.timeToSyncTo}`);
          videoSyncing.addVideoToSyncingQueue(videoPlayer);
        } else {
          console.error('logic error - videoSyncing is null during video `error`');
          videoPlayer.load();
        }
      } else {
        const time = videoPlayer.currentTime;
        videoPlayer.load();
        if (videoPlayer.hasAttribute('video-stopped')) {
          resetVideoPlayerTime();
        } else {
          console.log(`Error path ${time}`);
          videoPlayer.currentTime = time;
        }
      }
    });

    videoControls.audio.addEventListener('click', () => {
      debounce(() => {
        const useElement = videoControls.audio.querySelector('svg use');
        if (videoPlayer.muted) {
          videoPlayer.muted = !videoPlayer.muted;
          if (useElement) {
            useElement.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', "#audio-off");
          }
        } else {
          videoPlayer.muted = !videoPlayer.muted;
          if (useElement) {
            useElement.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', "#audio-on");
          }
        }
      }, 250);
    });
  }
  // Video trim 
  {
    const trimToggleSwitch = leftColumn['trimVideo'].toggle.input;
    const trimToggleLabel = leftColumn['trimVideo'].toggle.label;
    const trimBackBtn = leftColumn['trimVideo'].trimControl.trimBackBtn;
    const trimSaveBtn = leftColumn['trimVideo'].trimControl.trimSaveBtn;
    const trimDeleteBtn = leftColumn['trimVideo'].trimControl.trimDeleteBtn;
    const trimSelector = leftColumn['trimVideo'].trimControl.trimSelector;
    const trimCommitBtn = leftColumn['trimVideo'].trimControl.trimCommitBtn;
    const trimSlider = leftColumn['trimVideo'].trimControl.trimSlider;

    trimSlider.noUiSlider.on('update', function (values, _handle) {
      gForcePlot.drawStartEndPoints(values[0], values[1]);
    });

    trimToggleSwitch.addEventListener('click', () => {
      if (trimToggleSwitch.checked) {
        // disable the overlay when trimming
        removeOverlayTraces(rowUIElementMap);
        overlayCheckBtn.checked = false;
        toggleElementVisibility(false, [overlayCheckBtn, trimSelector]);

        gForcePlot.trimMode(true);

        const values = trimSlider.noUiSlider.get();
        gForcePlot.drawStartEndPoints(values[0], values[1]);
        toggleElementVisibility(true, [trimSlider, trimCommitBtn]);
      } else {
        // reset graph
        toggleElementVisibility(false, [trimSlider, trimCommitBtn]);
        toggleElementVisibility(true, [overlayCheckBtn, trimSelector]);
        gForcePlot.trimMode(false);
        gForcePlot.removeTrimPoints();
      }
    });

    trimSelector.addEventListener('change', (event) => {
      if (trimSelector.selectedIndex === 0) {
        // first index is always the default 
        toggleElementVisibility(false, [trimDeleteBtn]);
        return;
      }
      trimBackBtn.classList.remove('btn-outline-secondary');
      trimBackBtn.classList.add('btn-secondary');
      toggleElementVisibility(true, [trimBackBtn, trimDeleteBtn]);
      // for simplicity, disable the trim mode after selecting.
      // To implement, there would need to be tracking of a second level of offsetting
      // first trim offsets from the start, a second trim would be start + first trim + second trim
      // which can get out of hand if the end user keeps attempting to trim
      toggleElementVisibility(false, [trimToggleLabel, trimToggleSwitch]);
      const selectedRange = JSON.parse(event.target.value);
      const selectedText = event.target.options[event.target.selectedIndex].textContent;
      // remove previous trim, if applied, and apply new trim
      const data = rowEntry['dataStash'].data;
      const graphParams = {
        'view': '3d',
        'fps': data.fps,
        'trace': data.trace,
        'title': data.title,
      };

      gForcePlot.clearGraphs();
      gForcePlot.prepareGraphs(graphParams);
      gForcePlot.viewGraph('3d');

      //gForcePlot.removeTrimPoints();
      gForcePlot.commitTrim(selectedText, selectedRange['range']);
      const videoPlayer = leftColumn['videoContainer'].videoPlayer;
      videoPlayer.currentTime = selectedRange['range'].startTime;
    });

    trimBackBtn.addEventListener('click', () => {
      trimBackBtn.classList.remove('btn-secondary');
      trimBackBtn.classList.add('btn-outline-secondary');
      trimSaveBtn.classList.remove('btn-primary');
      trimSaveBtn.classList.add('btn-outline-primary');
      trimCommitBtn.classList.remove('btn-outline-secondary');
      trimCommitBtn.classList.add('btn-secondary');
      toggleElementVisibility(false, [trimBackBtn, trimSaveBtn]);
      toggleElementVisibility(true, [trimToggleLabel, trimToggleSwitch]);
      if (trimToggleSwitch.checked) {
        toggleElementVisibility(true, [trimCommitBtn, trimSlider]);
      } else {
        toggleElementVisibility(false, [trimCommitBtn, trimSlider]);
      }
      // undo the trim, revert back to prior
      // lazy - create the graph over
      if (!('dataStash' in rowEntry)) {
        console.error('No dataStash in rowEntry');
        return;
      }

      const data = rowEntry['dataStash'].data;
      const graphParams = {
        'view': '3d',
        'fps': data.fps,
        'trace': data.trace,
        'title': data.title,
      };

      gForcePlot.clearGraphs();
      gForcePlot.prepareGraphs(graphParams);
      gForcePlot.viewGraph('3d');

      if (!trimToggleSwitch.checked) {
        gForcePlot.trimMode(false);
        trimSelector.selectedIndex = 0;
      } else {
        // graph cleared so re-enable
        gForcePlot.trimMode(true);
        const values = trimSlider.noUiSlider.get();
        gForcePlot.drawStartEndPoints(values[0], values[1]);
      }
      delete rowEntry['trimBounds'];
      rowEntry['leftColumn'].videoContainer.videoPlayer.pause();
      rowEntry['leftColumn'].videoContainer.videoPlayer.currentTime = 0;
    });


    trimDeleteBtn.addEventListener('click', () => {
      const modalElement = document.getElementById('modal-container');
      const bsModal = new bootstrap.Modal(modalElement);

      const deleteTrimBtn = document.getElementById('delete-trim-btn');

      function deleteTrimEvent() {
        const selectedTrim = JSON.parse(trimSelector.value);
        if (!selectedTrim) {
          console.error(`No json in trimSelector.value`);
          //error to user
          return;
        }
        const jsonPath = rowEntry['dataFilePaths'].traceJsonPath;
        const deleteTrimRequest = {
          'type': 'update',
          'index': rowIndex,
          'jsonPath': jsonPath,
          'deleteTrimId': selectedTrim['id'],
        };
        console.log(`Delete trim request ${deleteTrimRequest}`);
        window.electron.traceFileIO(deleteTrimRequest);

        // modal is shared amongst all rows, so remove after use.
        deleteTrimBtn.removeEventListener('click', deleteTrimEvent);
        bsModal.hide();
      }
      deleteTrimBtn.addEventListener('click', deleteTrimEvent);
      bsModal.show();
    });

    trimSaveBtn.addEventListener('click', () => {
      // display save card to apply label for trimmed region for load later
      // take uiElements['trimBounds'], turn to string JSON.stringify(trimBounds)
      //console.log(JSON.stringify(trimBounds));
      //rowEntry['trimBounds'] = trimBounds;
      const dimViews = document.querySelectorAll('.fade-overlay');
      dimViews.forEach(view => {
        view.style.display = 'block';
        view.hidden = false;
      });
      saveTrimCard.hidden = false;
      document.getElementById('form-trim-title').textContent = '';
      // pass in the index to the save card element as an attribute so it knows where to get the required
      // information from
      saveTrimCard.setAttribute('save-event-row-id', rowIndex);
    });

    trimCommitBtn.addEventListener('click', () => {
      trimBackBtn.classList.remove('btn-outline-secondary');
      trimBackBtn.classList.add('btn-secondary');
      trimSaveBtn.classList.remove('btn-outline-primary');
      trimSaveBtn.classList.add('btn-primary');
      trimCommitBtn.classList.remove('btn-secondary');
      trimCommitBtn.classList.add('btn-outline-secondary');
      toggleElementVisibility(true, [trimBackBtn, trimSaveBtn]);
      toggleElementVisibility(false, [trimCommitBtn, trimSlider, trimToggleSwitch, trimToggleLabel]);
      let title = ('title' in rowEntry['dataStash'].data) ? rowEntry['dataStash'].data.title : null;
      if (title) {
        title += ' Trimmed';
      }
      const trimBounds = gForcePlot.commitTrim(title);
      console.log(JSON.stringify(trimBounds));
      rowEntry['trimBounds'] = trimBounds;
      rowEntry['leftColumn'].videoContainer.videoPlayer.currentTime = trimBounds['startTime'];
    });
  }
  // plot views
  {
    const dropDownButton = rightColumn['viewButtons'].dropDownButton;
    const dropDownMenu = rightColumn['viewButtons'].dropDownMenu;
    dropDownMenu.addEventListener('click', (event) => {
      if (event.target.classList.contains('dropdown-item')) {
        const clickedItemText = event.target.textContent;
        dropDownButton.textContent = clickedItemText;
        gForcePlot.setCameraPosition(clickedItemText);
      }
    });
  }
}

function adjustRowItemHeights(rootDiv) {
  const rowItems = document.getElementsByClassName('row-item');
  const dropZones = document.querySelectorAll('.drop-zone-container');
  const videoContainers = document.querySelectorAll('.video-container')
  const viewCount = rowItems.length;

  if (viewCount === 1) {
    rootDiv.style.height = '100%';
    dropZones.forEach(dropZone => {
      dropZone.style.height = '100%';
    });
    videoContainers.forEach(videoContainer => {
      videoContainer.style.height = '100%';
    });
  } else if (viewCount > 1) {
    rootDiv.style.height = 'auto';
    dropZones.forEach(dropZone => {
      dropZone.style.height = '40vh';
    });
    videoContainers.forEach(videoContainer => {
      videoContainer.style.height = '40vh';
    });
  }

  // Changing the height of plotly's parent div does not trigger a relayout - do this manually
  rowUIElementMap.forEach((value, _key) => {
    let graph = value['rightColumn'].plotly.top;
    if (graph.hasAttribute('has-data')) {
      Plotly.relayout(value['rightColumn'].plotly.top, {});
    }
    graph = value['rightColumn'].plotly.bottom;
    if (graph.hasAttribute('has-data')) {
      Plotly.relayout(value['rightColumn'].plotly.bottom, {});
    }
  });
}

function adjustPlotlyGraph() {
  rowUIElementMap.forEach((value, _key) => {
    let graph = value['rightColumn'].plotly.top;
    if (graph.data) {
      Plotly.relayout(graph, {});
    }
    graph = value['rightColumn'].plotly.bottom;
    if (graph.data) {
      Plotly.relayout(graph, {});
    }
  });
}

// need a better way of updating state, making new traces or removing them
// will not be updated when `exportAllBtn` is clicked.
let savedTraces = []

// Builds the loading view
function displayTraces(result) {
  const traces = result['traces'];
  const index = result['index'];

  savedTraces = traces;
  loadView.hidden = false;
  document.getElementById('main-content').hidden = true;
  document.getElementById('load-trace-title-text').textContent = 'Load a Trace';
  document.getElementById('export-all-btn-load-view').hidden = false;
  document.getElementById('import-btn-load-view').hidden = false;

  const exportAllBtn = document.getElementById('export-all-btn-load-view');
  if (!exportAllBtn.hasAttribute('click-listener-applied')) {
    exportAllBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const request = {
        traces: savedTraces,
      };
      window.electron.selectExportLocationDialogPrompt(request);
    });
  }
  const importBtn = document.getElementById('import-btn-load-view');
  if (!importBtn.hasAttribute('click-listener-applied')) {
    importBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const request = {
        'index': index,
      };
      window.electron.selectFilesToImportDialogPrompt(request);
    });
  }

  // not sure how best to prevent adding multiple listeners so condition on an attribute
  importBtn.setAttribute('click-listener-applied', '');
  exportAllBtn.setAttribute('click-listener-applied', '');

  function listItemClickHandler(index, tracePath, videoPath) {
    return (e) => {
      e.stopPropagation();
      const request = {
        'index': index,
        'type': 'read',
        'tracePath': tracePath,
        'videoPath': videoPath,
      };
      window.electron.traceFileIO(request);
    };
  }

  const list = document.getElementById('load-trace-list');
  list.innerHTML = '';

  traces.forEach(trace => {
    const title = trace.title;
    const id = trace.traceId;
    const videoPath = trace.videoPath;
    const videoFound = trace.videoFound;

    const listItem = document.createElement('li');
    listItem.className = "trace-list-item";

    let clickListItem = listItemClickHandler(index, trace.tracePath, videoPath);
    listItem.addEventListener('click', clickListItem);

    const titleStyleDiv = document.createElement('div');
    titleStyleDiv.style.flexGrow = '1';

    const titleDiv = document.createElement('div');
    titleDiv.className = "trace-item-title";
    titleDiv.textContent = title;
    titleStyleDiv.appendChild(titleDiv);

    const missingDiv = document.createElement('div');
    missingDiv.className = "trace-item-video-missing";

    if (!videoFound) {
      const warningDiv = document.createElement('div');
      warningDiv.className = "trace-item-video trace-item-missing-text";
      warningDiv.textContent = "⚠️ Video missing";
      missingDiv.appendChild(warningDiv);

      const videoDiv = document.createElement('div');
      videoDiv.className = "trace-item-video";
      videoDiv.textContent = videoPath;
      missingDiv.appendChild(videoDiv);
      console.warn(`${videoPath} missing!`);
    }

    titleStyleDiv.appendChild(missingDiv);
    listItem.appendChild(titleStyleDiv);

    if (!videoFound) {
      const fixBtn = document.createElement('button');
      fixBtn.className = 'btn btn-outline-warning me-2';
      fixBtn.textContent = 'Fix path';
      fixBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.electron.openVideoDialogPrompt(index, true, trace.traceId);
      });
      listItem.appendChild(fixBtn);
    }

    function handleOutsideClick(e) {
      if (!titleDiv.contains(e.target)) {
        titleDiv.textContent = title;
        titleDiv.contentEditable = 'false';
        titleDiv.classList.remove('editable');
        if (titleStyleDiv.lastElementChild && titleStyleDiv.lastElementChild.id === 'rename-hint') {
          titleStyleDiv.removeChild(titleStyleDiv.lastElementChild);
        }
        document.removeEventListener('click', handleOutsideClick);
        listItem.addEventListener('click', clickListItem);
      }
    }

    function handleRenameKeypress(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        titleDiv.contentEditable = 'false';
        titleDiv.classList.remove('editable');
        if (titleStyleDiv.lastElementChild && titleStyleDiv.lastElementChild.id === 'rename-hint') {
          titleStyleDiv.removeChild(titleStyleDiv.lastElementChild);
        }

        listItem.addEventListener('click', clickListItem);
        document.removeEventListener('click', handleOutsideClick);

        const request = {
          'type': 'update',
          'index': index,
          'title': titleDiv.textContent,
          'traceId': trace.traceId,
        };
        window.electron.traceFileIO(request);
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        titleDiv.contentEditable = 'false';
        titleDiv.textContent = title;
        listItem.addEventListener('click', clickListItem);
        titleDiv.classList.remove('editable');
        if (titleStyleDiv.lastElementChild && titleStyleDiv.lastElementChild.id === 'rename-hint') {
          titleStyleDiv.removeChild(titleStyleDiv.lastElementChild);
        }
        document.removeEventListener('click', handleOutsideClick);
      }
    }

    const renameBtn = document.createElement('button');
    renameBtn.className = 'btn btn-outline-light me-2';
    renameBtn.textContent = 'Rename';
    renameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      listItem.removeEventListener('click', clickListItem);

      titleDiv.contentEditable = 'true';
      titleDiv.classList.add('editable');
      titleDiv.focus();
      titleDiv.addEventListener('keydown', handleRenameKeypress);
      if (titleStyleDiv.lastElementChild && titleStyleDiv.lastElementChild.id !== 'rename-hint') {
        const div = document.createElement('div');
        div.className = 'm-1';
        div.id = 'rename-hint';
        div.textContent = "Press '\Enter'\ to save";
        titleStyleDiv.appendChild(div);
      }
      document.addEventListener('click', handleOutsideClick, true);
    });

    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn btn-outline-info me-2';
    exportBtn.textContent = 'Export';
    exportBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const request = {
        'traces': [trace],
      };
      window.electron.selectExportLocationDialogPrompt(request);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-outline-danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const request = {
        'index': index,
        'type': 'delete',
        'traceId': id,
      };
      window.electron.traceFileIO(request);
    });

    listItem.appendChild(renameBtn);
    listItem.appendChild(exportBtn);
    listItem.appendChild(deleteBtn);

    list.appendChild(listItem);
  });
}

function searchTracesAction(e) {
  const searchText = e.target.value.toLowerCase();
  const listItems = document.getElementById('load-trace-list').getElementsByTagName('li');
  for (const item of listItems) {
    const itemText = item.textContent.toLowerCase();
    if (itemText.includes(searchText)) {
      item.style.display = '';
    } else {
      item.style.display = 'none';
    }
  }
}

function changeSvgIcon(element, xlinkHref) {
  const useElement = element.querySelector('svg use');
  if (useElement) {
    useElement.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', xlinkHref);
  }
}

class VideoSyncing {

  constructor(triggerVideoElement, shouldPlayAfterSeeking, state) {
    console.debug(`VideoSyncing ${triggerVideoElement.id} as trigger - time ${triggerVideoElement.currentTime} - state ${state}`);

    this.timeToSyncTo = triggerVideoElement.currentTime;
    this.triggerVideoElement = triggerVideoElement;
    this.shouldPlayAfterSeeking = shouldPlayAfterSeeking;
    this.state = state;
    this.videoQueue = new Queue();
  }

  addVideoToSyncingQueue(videoElement) {
    console.debug(`Adding ${videoElement.id} to queue - state = ${this.state}`);
    this.videoQueue.enqueue(videoElement);
  }

  getNextVideo() {
    const videoElement = this.videoQueue.dequeue();

    if (!videoElement) {
      return null;
    }

    if (!document.getElementById(videoElement.id)) {
      return this.getNextVideo();
    }

    return videoElement;
  }


  isEmpty() {
    return this.videoQueue.isEmpty();
  }
}
class Queue {
  constructor() {
    this.items = [];
  }

  enqueue(element) {
    this.items.push(element);
  }

  dequeue() {
    if (this.isEmpty()) {
      return null;
    }
    return this.items.shift();
  }

  isEmpty() {
    return this.items.length === 0;
  }

  front() {
    if (this.isEmpty()) {
      return null
    }
    return this.items[0];
  }
}