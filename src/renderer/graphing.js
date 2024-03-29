class GForcePlot {
  #graphDivs = null;
  #videoPlayer = null;
  #syncCallback = null;
  #fps = null;
  #rawTrace = null;
  #title = null;
  #graph3d = null;
  #graph2dLateral = null;
  #graph2dHorizontal = null;
  #currentView = '3d';

  constructor(parameters) {
    this.#graphDivs = {
      'top': parameters['graphDivs'].top,
      'bottom': parameters['graphDivs'].bottom,
    };
    this.#videoPlayer = parameters['videoPlayer'];
    this.#syncCallback = parameters['syncCallback'];
  }

  prepareGraphs(parameters) {
    this.#fps = parameters['fps'];
    this.#rawTrace = parameters['trace'];

    if (parameters['title'] !== null) {
      this.#title = parameters['title'];
    }

    const xVals = this.#rawTrace.map(point => point.x);
    const yVals = this.#rawTrace.map(point => point.y);
    const zVals = this.#rawTrace.map(point => point.z);

    const graphData = this.#processTraceData(xVals, yVals, zVals);
    let mode = {
      'view': '3d',
    }
    this.#graph3d = this.#createPlot(mode, this.#graphDivs.top, graphData, this.#videoPlayer);
    mode = {
      'view': '2d',
      'type': 'horizontal',
    };
    this.#graph2dLateral = this.#createPlot(mode, this.#graphDivs.top, graphData, this.#videoPlayer);
    mode = {
      'view': '2d',
      'type': 'lateral',
    };
    this.#graph2dHorizontal = this.#createPlot(mode, this.#graphDivs.bottom, graphData, this.#videoPlayer);
  }

  overlayTraces(newTraceParameters) {
    if (this.#rawTrace === null) {
      return
    }

    let dataToPlot = [];
    if (newTraceParameters.length === 0) {
      console.warn('No trace data to overlay.')
      return;
    }

    // array of traces, parameters in same form as original parameters
    for (const params of newTraceParameters) {
      const rawTrace = params['trace'];
      const xVals = rawTrace.map(point => point.x);
      const yVals = rawTrace.map(point => point.y);
      const zVals = rawTrace.map(point => point.z);
      let traceData = this.#processTraceData(xVals, yVals, zVals);
      traceData['name'] = params['title'];
      dataToPlot.push(traceData);
    }

    if (this.#currentView === '3d') {
      this.#graph3d.overlayTraces(dataToPlot);
    } else {
      this.#graph2dHorizontal.overlayTraces(dataToPlot);
      this.#graph2dLateral.overlayTraces(dataToPlot);
    }
  }

  removeOverlaidTraces(specificIndexToRemove) {
    if (this.#rawTrace !== null) {
      if (this.#currentView === '3d') {
        this.#graph3d.removeOverlaidTraces(specificIndexToRemove);
      } else {
        this.#graph2dHorizontal.removeOverlaidTraces(specificIndexToRemove);
        this.#graph2dLateral.removeOverlaidTraces(specificIndexToRemove);

      }
    }
  }

  trimMode(enable) {
    if (this.#rawTrace === null) {
      return
    }
    if (this.#currentView === '3d') {
      this.#graph3d.trimMode(enable);
    } else {
      this.#graph2dHorizontal.trimMode(enable);
      this.#graph2dLateral.trimMode(enable);
    }
  }

  drawStartEndPoints(startPoint, endPoint) {
    if (this.#graph3d) {
      this.#graph3d.drawStartEndPoints(startPoint, endPoint);
    }
  }

  removeTrimPoints() {
    this.#graph3d.removeTrimPoints();
  }

  commitTrim(title) {
    return this.#graph3d.commitTrim(title);
  }

  viewGraph(view) {
    this.#currentView = view;
    switch (view) {
      case '2d': {
        this.#graph3d.clear();
        this.#graphDivs.top.setAttribute('has-data', '');
        this.#graphDivs.bottom.setAttribute('has-data', '');
        this.#graph2dLateral.createPlotlyGraph(this.#title, this.#fps, this.#syncCallback);
        this.#graph2dHorizontal.createPlotlyGraph(this.#title, this.#fps, this.#syncCallback);
        return;
      }
      case '3d': {
        this.#graph2dLateral.clear();
        this.#graph2dHorizontal.clear();

        this.#graphDivs.top.setAttribute('has-data', '');

        this.#graph3d.createPlotlyGraph(this.#title, this.#fps, this.#syncCallback);
        return;
      }
      default:
        throw new Error(`Invalid view (${view}) specified`);
    }
  }

  setCameraPosition(position) {
    if (this.#graph3d === null) {
      return;
    }
    this.#graph3d.changeView(position);
  }

  syncGraphViews(graphDiv, view, parameter) {
    if (graphDiv._isProgrammaticRelayout) {
      return;
    }
    graphDiv._isProgrammaticRelayout = true;

    if (view === '3d') {
      Plotly.relayout(graphDiv, {
        'scene.camera': parameter
      })
        .then(() => {
          graphDiv._isProgrammaticRelayout = false;
        });
    } else if (view === '2d') {
      Plotly.relayout(graphDiv, parameter);
    }
  }

  updateTitle(title) {
    this.#title = title;

    if (this.#graph3d && this.#graphDivs.top.hasAttribute('has-data')) {
      this.#graph3d.updateTitle(title);
    }

    if (this.#graph2dLateral && this.#graphDivs.top.hasAttribute('has-data')) {
      this.#graph2dLateral.updateTitle(title);
    }

    if (this.#graph2dHorizontal && this.#graphDivs.bottom.hasAttribute('has-data')) {
      this.#graph2dHorizontal.updateTitle(title);
    }
  }

  clearGraphs() {
    if (this.#graph3d) {
      this.#graph3d.clear();
      this.#graph3d = null;
    }
    if (this.#graph2dHorizontal) {
      this.#graph2dHorizontal.clear();
      this.#graph2dHorizontal = null;
    }
    if (this.#graph2dLateral) {
      this.#graph2dLateral.clear();
      this.#graph2dLateral = null;
    }
    this.#graphDivs.top.removeAttribute('has-data');
    this.#graphDivs.bottom.removeAttribute('has-data');
    this.#title = null;
    this.#fps = null;
    this.#rawTrace = null;
  }

  #processTraceData(xVals, yVals, zVals) {

    if (xVals.length == 0 || yVals.length == 0 || zVals.length == 0) {
      console.log("Invalid trace data returned from processing");
      return;
    }

    // Normalize values to [-1, 1] due to opencv giving us pixel coordinates. 
    // Converting pixels to a g-force value requires more thought. See comment in processing/garmin_video_processing.py
    // TODO: move this to script, avoid doing more processing on UI
    const normX = GraphDataUtilities.normalizeData(xVals);
    const normY = GraphDataUtilities.normalizeData(yVals);

    return {
      'x': normX,
      'y': normY,
      'z': zVals,
    }
  }

  #createPlot(mode, plotlyDiv, graphData, videoPlayer) {
    switch (mode.view) {
      case '2d': return new Plot2DStrategy(mode, plotlyDiv, graphData, videoPlayer);
      case '3d': return new Plot3DStrategy(mode, plotlyDiv, graphData, videoPlayer);
      default: throw new Error("Unsupported plot view");
    }
  }
}

class GraphDataUtilities {
  static normalizeData(data) {
    const sum = data.reduce((a, b) => a + b, 0);
    const mean = sum / data.length;

    const squaredDiffs = data.map(value => Math.pow(value - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length;
    const stdDev = Math.sqrt(avgSquaredDiff);

    const standardizedData = data.map(value => (value - mean) / stdDev);

    const min = Math.min(...standardizedData);
    const max = Math.max(...standardizedData);

    const rescaledData = standardizedData.map(value => {
      return -1 + (2 * (value - min) / (max - min));
    });

    return rescaledData;
  }
}

class PlotStrategy {

  constructor(mode, plotlyDiv, graphData, videoPlayer) {
    this.mode = mode;
    this.plotlyDiv = plotlyDiv;
    this.graphData = graphData;
    this.videoPlayer = videoPlayer;
    this.prevTime = 0;
    this.overlaidTraceNames = [];
    this.trimModeEnable = false;
    this.trimBounds = {
      'startFrame': null,
      'startTime': null,
      'endFrame': null,
      'endTime': null,
    };
    this.trimmedGraphData = null;
  }

  createPlotlyGraph(title, fps, syncCallback) {
    throw new ("Extend PlotStrategy and implement updateGraph");
  }

  overlayTraces(newTraceParameters) {
    throw new ("Extend PlotStrategy and implement overlayTraces");
  }

  removeOverlaidTraces(specificIndexToRemove) {
    throw new ("extend PlotStrategy and implement removeOverlaidTraces");
  }

  trimMode(enable) {
    this.trimModeEnable = enable;
  }

  drawStartEndPoints(startPoint, endPoint) {
    throw new ("Extend PlotStrategy and implement drawStartEndPoints");
  }

  removeTrimPoints() {
    throw new ("Extend PlotStrategy and implement removeTrimPoints");
  }

  commitTrim(title) {
    throw new ("extend blah");
  }

  changeView(cameraOption) {
    throw new ("Extend PlotStrategy and implement changeView");
  }

  updateTitle(title) {
    throw new ("Extend PlotStrategy and implement updateTitle")
  }

  clear() {
    this.prevTime = 0;
    this.overlaidTraceNames.length = 0;
    this.trimmedGraphData = null;
    for (const key in this.trimBounds) {
      this.trimBounds[key] = null;
    }
  }

  #buildLayout() {
    throw new ("Extend PlotStrategy and implement buildLayout");
  }

  #buildTrace(xData, yData, zData) {
    throw new ("Extend PlotStrategy and implement buildTrace");
  }

  #buildMarker(xData, yData, zData) {
    throw new ("Extend PlotStrategy and implement buildMarker");
  }
}

class Plot2DStrategy extends PlotStrategy {
  createPlotlyGraph(title, fps, syncCallback) {
    this.fps = fps;
    const frames = this.graphData.z;
    const type = this.mode.type;
    const data = (type == 'lateral') ? this.graphData.x : this.graphData.y;

    const trace = this.#buildTrace(frames, data, null);
    const marker = this.#buildMarker(frames, data, null);
    const layout = this.#buildLayout(title)


    const config = { responsive: true }
    Plotly.newPlot(this.plotlyDiv, [trace, marker], layout, config);
    this.plotlyDiv._isProgrammaticRelayout = false;

    this.plotlyDiv.on('plotly_relayout', (eventData) => {
      // assuming any view change on the 2d plot will always have the x/y ranges. It wouldn't make sense to only get 1 dimension
      if ((eventData['xaxis.range[0]'] && eventData['yaxis.range[0]'])) {
        syncCallback(this.plotlyDiv, '2d', eventData);
      }
    });

    this.plotlyDiv.on('plotly_click', (eventData) => {
      debounce(() => {
        console.log('plotly-click');
        const pointData = eventData.points[0];
        const videoFrame = pointData.x;
        const playbackTime = (videoFrame / fps).toFixed(2);

        console.log(`${this.videoPlayer.id} plotly_click set to ${playbackTime}`);

        // if the video is playing, pause first because we'll need to wait for seeking to finish before resuming
        if (!this.videoPlayer.paused) {
          console.log(`${this.videoPlayer.id} will pause due to plotly_click`);
          this.videoPlayer.pause();
          this.videoPlayer.setAttribute('plotly-paused', '');

          // don't set the time until we get the `pause` event.
          this.videoPlayer.setAttribute('plotly-playback-time', playbackTime);
        } else {
          console.log(`${this.videoPlayer.id} already paused in plotly_click`);
          this.videoPlayer.setAttribute('plotly-already-paused', '');
          // safe to seek
          this.videoPlayer.currentTime = playbackTime;
        }


      }, 100);
    });

    // TODO: Investigate using requestAnimationFrame(callback) instead of using 'timeupdate'
    // 'timeupdate' fires about once every 0.3 seconds. This makes the marker move sporadically
    this.videoPlayer.addEventListener('timeupdate', this.#updatePlotMarker);
  }

  overlayTraces(newTraceParameters) {
    for (const param of newTraceParameters) {
      if (this.overlaidTraceNames.includes(param['name'])) {
        console.log(`${param['name']} already applied`);
        continue;
      }

      const type = this.mode.type;
      const frames = param['z'];
      const data = (type === 'lateral') ? param['x'] : param['y'];
      Plotly.addTraces(this.plotlyDiv, {
        x: frames,
        y: data,
        type: 'scatter',
        mode: 'lines',
        name: param['name'],
        hoverinfo: 'none',
        line: {
          width: 1,
        },
      });
      this.overlaidTraceNames.push(param['name']);
    }
  }

  removeOverlaidTraces(specificIndexToRemove) {
    // [0] == original plot, [1] == marker, [2+] == overlaid plots
    if (this.plotlyDiv.data.length == 2) {
      console.log('No traces to remove')
      return;
    }

    // coupled with the UI layout - remove a single row, we remove only the last overlaid plot
    if (specificIndexToRemove !== undefined) {
      if (specificIndexToRemove >= this.plotlyDiv.data.length) {
        console.error(`Invalid overlay index ${specificIndexToRemove} - ${this.plotlyDiv.data.length} entries exist`)
        return;
      }

      Plotly.deleteTraces(this.plotlyDiv, [specificIndexToRemove]);
      this.overlaidTraceNames.splice(specificIndexToRemove, 1);
    } else {
      let indicesToRemove = []
      const startIdx = 2;
      for (let i = startIdx; i < this.plotlyDiv.data.length; i++) {
        indicesToRemove.push(i);
      }

      Plotly.deleteTraces(this.plotlyDiv, indicesToRemove);
      this.overlaidTraceNames.length = 0;
    }
  }

  changeView(cameraOption) {
    // no-op
  }

  updateTitle(title) {
    Plotly.relayout(this.plotlyDiv, {
      title: title,
    });
  }

  clear() {
    Plotly.purge(this.plotlyDiv);
    this.plotlyDiv.removeAttribute('has-data');
    this.prevTime = 0;
    this.videoPlayer.removeEventListener('timeupdate', this.#updatePlotMarker);
    this.overlaidTraceNames.length = 0;
  }

  #updatePlotMarker = () => {
    // plotly_click is fired multiple times when Plotly.restyle is called. I don't believe this is 
    // expected behavior. When removing the call to restyle, plotly_click is fired once per click. 
    // As a work around, check for the spurious events to 'timeupdate' by comparing with the currentTime
    // with the previous time
    // debouncing would take too long
    if (this.prevTime == this.videoPlayer.currentTime) {
      return;
    }

    const plotData = this.plotlyDiv.data;
    if (plotData.length == 0) {
      console.error(`${this.plotlyDiv.id} plotData has no data!`);
      return;
    }

    const frameNumber = Math.floor(this.videoPlayer.currentTime * this.fps);
    if (frameNumber < 0 || frameNumber >= plotData[0].x.length) {
      return;
    }

    const newX = plotData[0].x[frameNumber];
    const newY = plotData[0].y[frameNumber];
    Plotly.restyle(this.plotlyDiv, {
      'x': [[newX]],
      'y': [[newY]],
    }, 1);

    this.prevTime = this.videoPlayer.currentTime;
  }

  #buildLayout(title) {
    const type = this.mode.type;
    const dataAxisTitle = (type === 'lateral') ? 'Corner' : 'Acceleration';
    if (title == null) {
      title = `${dataAxisTitle} G-forces`;
    } else {
      title = `${dataAxisTitle} G-forces ${title}`;
    }

    return {
      title: title,
      autosize: true,
      responsive: true,
      margin: {
        l: 100,
        r: 100,
        b: 100,
        t: 50,
        pad: 0,
        bgcolor: 'red',
      },
      xaxis: {
        showbackground: false,
        backgroundcolor: 'rgba(230, 230, 230, 0.8)',
        title: 'Frame',
        linewidth: 1,
        gridwidth: 1,
        autorange: false,
        range: [0, this.graphData.z.length]
      },
      yaxis: {
        showbackground: false,
        backgroundcolor: 'rgba(230, 230, 230, 0.8)',
        title: 'Force',
        linewidth: 1,
        gridwidth: 1,
        range: [-1.25, 1.25], // pad a bit so the plot doesn't hit the very top/bottom of the view
        autorange: false,
      },

    };
  }

  #buildTrace(xData, yData, _zData) {
    return {
      type: 'scatter',
      name: 'G-force',
      hoverinfo: 'none',
      x: xData,
      y: yData,
      mode: 'lines',
      line: {
        width: 3,
        color: 'red',
      }
    }
  }

  #buildMarker(xData, yData, _zData) {
    return {
      type: 'scatter',
      x: [xData[0]],
      y: [yData[0]],
      name: 'Video frame',
      hoverinfo: 'none',
      mode: 'markers',
      marker: {
        size: 7,
        color: 'blue',
      },
    }
  }
}

class Plot3DStrategy extends PlotStrategy {

  #syncCallback = null;

  createPlotlyGraph(title, fps, syncCallback, x, y, z) {
    this.fps = fps;
    this.#syncCallback = syncCallback;
    const trace = this.#buildTrace((x === undefined) ? this.graphData.x : x, (y === undefined) ? this.graphData.y : y, (z === undefined) ? this.graphData.z : z);
    const marker = this.#buildMarker((x === undefined) ? this.graphData.x : x, (y === undefined) ? this.graphData.y : y, (z === undefined) ? this.graphData.z : z);
    const layout = this.#buildLayout(title);
    const config = { responsive: true }

    Plotly.newPlot(this.plotlyDiv, [trace, marker], layout, config);
    this.plotlyDiv._isProgrammaticRelayout = false;

    this.plotlyDiv.on('plotly_relayout', (eventData) => {
      if (eventData['scene.camera'] && !this.plotlyDiv._isProgrammaticRelayout) {
        syncCallback(this.plotlyDiv, '3d', eventData['scene.camera']);
      }
    });

    // FIXME: have some interface defined to tell the video player to play/pause
    // rather than passing the underlying type directly in here
    this.plotlyDiv.on('plotly_click', (eventData) => {
      debounce(() => {
        const pointData = eventData.points[0];
        const videoFrame = pointData.z;
        const playbackTime = (videoFrame / fps).toFixed(2);
        if (this.trimModeEnable) {
          // take frame with trim into account, adjust playback time of video to correspond with new location 
          // of the trimmed plot
        } else {
          console.log(`${this.videoPlayer.id} plotly_click set to ${playbackTime}`);

          // if the video is playing, pause first because we'll need to wait for seeking to finish before resuming
          if (!this.videoPlayer.paused) {
            console.log(`${this.videoPlayer.id} will pause due to plotly_click`);
            this.videoPlayer.pause();
            this.videoPlayer.setAttribute('plotly-paused', '');

            // don't set the time until we get the `pause` event.
            this.videoPlayer.setAttribute('plotly-playback-time', playbackTime);
          } else {
            console.log(`${this.videoPlayer.id} already paused in plotly_click`);
            this.videoPlayer.setAttribute('plotly-already-paused', '');
            // safe to seek
            this.videoPlayer.currentTime = playbackTime;
          }
        }
      }, 100);
    });

    // TODO: Investigate using requestAnimationFrame(callback) instead of using 'timeupdate'
    // 'timeupdate' fires about once every 0.3 seconds. This makes the marker move sporadically
    this.videoPlayer.addEventListener('timeupdate', this.#updatePlotMarker);
  }

  drawStartEndPoints(startPoint, endPoint) {
    if (!this.trimModeEnable) {
      return;
    }

    const xBounds = [-1, 1];
    const yBounds = [-1, 1];

    const videoFrameStart = Math.floor(parseFloat(startPoint)); // can't have part of a frame
    let videoFrameEnd = Math.ceil(parseFloat(endPoint));
    videoFrameEnd = (videoFrameEnd >= this.graphData.z.length) ? (this.graphData.z.length - 1) : videoFrameEnd;
    const playbackTimeStart = parseFloat((videoFrameStart / this.fps).toFixed(2));
    const playbackTimeEnd = parseFloat((videoFrameEnd / this.fps).toFixed(2));

    const Zstart = Math.floor(videoFrameStart);
    const plotData = this.plotlyDiv.data;
    if (plotData.length == 2) {
      const startPlane = {
        x: [xBounds[0], xBounds[1], xBounds[1], xBounds[0]],
        y: [yBounds[0], yBounds[0], yBounds[1], yBounds[1]],
        z: [Zstart, Zstart, Zstart, Zstart],
        i: [0, 0],
        j: [1, 2],
        k: [2, 3],
        type: 'mesh3d',
        opacity: 0.3,
        color: 'rgb(93, 78, 180)',
        hoverinfo: 'none'
      };
      Plotly.addTraces(this.plotlyDiv, [startPlane]);
    } else if (plotData.length === 4 && this.trimBounds['startFrame'] !== Zstart) {
      const update = {
        x: [[xBounds[0], xBounds[1], xBounds[1], xBounds[0]]],
        y: [[yBounds[0], yBounds[0], yBounds[1], yBounds[1]]],
        z: [[Zstart, Zstart, Zstart, Zstart]],
        i: [[0, 0]],
        j: [[1, 2]],
        k: [[2, 3]],
      };
      Plotly.update(this.plotlyDiv, update, {}, [2]);
    }

    const Zend = videoFrameEnd;

    if (plotData.length == 3) {
      const endPlane = {
        x: [xBounds[0], xBounds[1], xBounds[1], xBounds[0]],
        y: [yBounds[0], yBounds[0], yBounds[1], yBounds[1]],
        z: [Zend, Zend, Zend, Zend],
        i: [0, 0],
        j: [1, 2],
        k: [2, 3],
        type: 'mesh3d',
        opacity: 0.3,
        color: 'rgb(93, 78, 180)',
        hoverinfo: 'none'
      };
      Plotly.addTraces(this.plotlyDiv, [endPlane]);
    } else if (plotData.length == 4) {
      if (this.trimBounds['endFrame'] !== Zend) {
        const update = {
          x: [[xBounds[0], xBounds[1], xBounds[1], xBounds[0]]],
          y: [[yBounds[0], yBounds[0], yBounds[1], yBounds[1]]],
          z: [[Zend, Zend, Zend, Zend]],
          i: [[0, 0]],
          j: [[1, 2]],
          k: [[2, 3]],
        };
        Plotly.update(this.plotlyDiv, update, {}, [3]);
      }
    }

    this.trimBounds['startFrame'] = videoFrameStart;
    this.trimBounds['endFrame'] = videoFrameEnd;
    this.trimBounds['startTime'] = playbackTimeStart;
    this.trimBounds['endTime'] = playbackTimeEnd;
  }

  removeTrimPoints() {
    const plotData = this.plotlyDiv.data;
    if (plotData.length == 0) {
      console.error(`${this.plotlyDiv.id} plotData has no data!`);
      return;
    }

    if (plotData.length == 2) {
      // nothing to do
      return;
    }
    // otherwise, remove the meshes
    Plotly.deleteTraces(this.plotlyDiv, [2, 3]);
  }

  commitTrim(title) {
    const startFrame = this.trimBounds['startFrame'];
    const endFrame = this.trimBounds['endFrame'];
    const plotData = this.plotlyDiv.data;
    const newData = {
      x: plotData[0].x.slice(startFrame, endFrame),
      y: plotData[0].y.slice(startFrame, endFrame),
      z: Array.from({ length: endFrame - startFrame }, (_, i) => i),
    };

    this.trimmedGraphData = newData;

    this.createPlotlyGraph(title, this.fps, this.#syncCallback, newData.x, newData.y, newData.z);
    return this.trimBounds;
  }


  overlayTraces(newTraceParameters) {
    for (const param of newTraceParameters) {
      if (this.overlaidTraceNames.includes(param['name'])) {
        console.log(`${param['name']} already applied`);
        continue;
      }

      Plotly.addTraces(this.plotlyDiv, {
        x: param['x'],
        y: param['y'],
        z: param['z'],
        type: 'scatter3d',
        mode: 'lines',
        name: param['name'],
        hoverinfo: 'none',
        line: {
          width: 2,
        },
      });
      this.overlaidTraceNames.push(param['name']);
    }
  }

  removeOverlaidTraces(specificIndexToRemove) {
    // [0] == original plot, [1] == marker, [2+] == overlaid plots
    if (this.plotlyDiv.data.length == 2) {
      console.log('No traces to remove')
      return;
    }

    // coupled with the UI layout - remove a single row, we remove only the last overlaid plot
    if (specificIndexToRemove !== undefined) {
      if (specificIndexToRemove >= this.plotlyDiv.data.length) {
        console.error(`Invalid overlay index ${specificIndexToRemove} - ${this.plotlyDiv.data.length} entries exist`)
        return;
      }

      Plotly.deleteTraces(this.plotlyDiv, [specificIndexToRemove]);
      this.overlaidTraceNames.splice(specificIndexToRemove, 1);
    } else {
      let indicesToRemove = []
      const startIdx = 2;
      for (let i = startIdx; i < this.plotlyDiv.data.length; i++) {
        indicesToRemove.push(i);
      }

      Plotly.deleteTraces(this.plotlyDiv, indicesToRemove);
      this.overlaidTraceNames.length = 0;
    }
  }

  changeView(position) {
    const cameraPosition = this.#getCameraPosition(position);
    Plotly.relayout(this.plotlyDiv, cameraPosition);
  }

  updateTitle(title) {
    Plotly.relayout(this.plotlyDiv, {
      title: title,
    });
  }

  clear() {
    super.clear();
    Plotly.purge(this.plotlyDiv);
    this.plotlyDiv.removeAttribute('has-data');
    this.videoPlayer.removeEventListener('timeupdate', this.#updatePlotMarker);
  }

  #updatePlotMarker = () => {
    // plotly_click is fired multiple times when Plotly.restyle is called. When removing the call to restyle, 
    // plotly_click is fired once per click. I don't believe this is expected behavior.
    // As a work around, check for the spurious events in 'timeupdate' by comparing with the currentTime
    // with the previous time. If the first click tracks to some point in time, and spurious events are also 
    // tracking to the same point in time, we only need to do it once.
    // Using `debounce` will take too long.
    if (this.prevTime == this.videoPlayer.currentTime) {
      return;
    }

    const plotData = this.plotlyDiv.data;
    if (plotData.length == 0) {
      console.error(`${this.plotlyDiv.id} plotData has no data!`);
      return;
    }

    /*
    I pick start and end points for from
    i have starting frame number and ending frame number
    i change the time on the video to match the starting frame time
    startTime + trimStartTime = deltaStart
    
    // marker location is based on video start time
    video does not have concept of trim'd times. +5 seconds trimStartTime means take currentTime - trimStartTime 
    */
    let frameNumber = 0;
    if (this.trimmedGraphData !== null) {
      frameNumber = Math.floor(this.videoPlayer.currentTime * this.fps) + 1; // +1 to account for Math.floor taking us below a valid frame number
      frameNumber -= this.trimBounds['startFrame'];

      if (this.videoPlayer.currentTime >= this.trimBounds['endTime']) {
        this.videoPlayer.pause();
      }
    } else {
      frameNumber = Math.floor(this.videoPlayer.currentTime * this.fps);
    }

    if (frameNumber < 0 || frameNumber >= plotData[0].z.length) {
      // Latter condition Can happen if video syncing playback does not contain the same number of frames - this is not an error
      return;
    }

    // plotData[0] == trace, plotData[1] == marker
    const newX = plotData[0].x[frameNumber];
    const newY = plotData[0].y[frameNumber];
    const newZ = plotData[0].z[frameNumber];

    // draw marker at new coordinates
    // TODO: i wonder if using the animation stuff would be better
    Plotly.restyle(this.plotlyDiv, {
      'x': [[newX]],
      'y': [[newY]],
      'z': [[newZ]],
    }, 1);

    this.prevTime = this.videoPlayer.currentTime;
    // IDEA: move the camera to follow the marker? That's math dynamically adjusting camera coordinates while keeping the marker in center view.
  }

  #getCameraPosition(position) {
    switch (position) {
      case 'Front':
        return {
          'scene.camera': {
            eye: {
              x: 0,
              y: 0,
              z: -5,
            },
            center: {
              x: 0,
              y: 0,
              z: 0,
            },
            up: {
              x: 0,
              y: 1,
              z: 0,
            },
          }
        };
      case 'Back':
        return {
          'scene.camera': {
            eye: {
              x: 0,
              y: 0,
              z: 5,
            },
            center: {
              x: 0,
              y: 0,
              z: 0,
            },
            up: {
              x: 0,
              y: 1,
              z: 0,
            },
          },
        };
      case 'Corner':
        return {
          'scene.camera': {
            eye: {
              x: 0,
              y: 5,
              z: 0,
            },
            center: {
              x: 0,
              y: 0,
              z: 0,
            },
            up: {
              x: 1,
              y: 0,
              z: 0,
            },
          },
        };
      case 'Accel':
        return {
          'scene.camera': {
            eye: {
              x: -5,
              y: 0,
              z: 0,
            },
            center: {
              x: 0,
              y: 0,
              z: 0,
            },
            up: {
              x: 0,
              y: 1,
              z: 0,
            },
          },
        };
      case 'Iso':
        return {
          'scene.camera': {
            eye: {
              x: -2.30,
              y: 1.35,
              z: -4.6,
            },
            center: {
              x: 0.75,
              y: -0.40,
              z: -0.50,
            },
            up: {
              x: 0.25,
              y: 1,
              z: 0.20,
            },
          },
        };
      default:
        console.error(`Unknown camera position: ${position}`);
        return {};
    }
  }

  #buildLayout(title) {
    if (title == null) {
      title = "G-forces Visualization";
    }
    return {
      title: title,
      autosize: true,
      responsive: true,
      margin: {
        l: 20,
        r: 20,
        b: 20,
        t: 50,
        pad: 0,
        bgcolor: 'red'
      },
      scene: {
        dragmode: 'orbit',
        xaxis: {
          showbackground: false,
          backgroundcolor: 'rgba(230, 230, 230, 0.8)',
          title: "Corner",
          linewidth: 3,
          gridwidth: 3,
          range: [-1, 1],
        },
        yaxis: {
          showbackground: false,
          backgroundcolor: 'rgba(230, 230, 230, 0.8)',
          title: "Accel",
          linewidth: 3,
          gridwidth: 3,
          range: [-1, 1],
        },
        zaxis: {
          showbackground: false,
          backgroundcolor: 'rgba(230, 230, 230, 0.8)',
          title: "Frame",
          linewidth: 3,
          gridwidth: 3,
          color: 'black',
        },
        aspectratio: {
          x: 1,
          y: 1,
          z: 6, // IDEA: scale this based on num of frames? not too long though or the graph is hard to read
        },
        // Default front
        camera: {
          eye: {
            x: 0,
            y: 0,
            z: -5,
          },
          center: {
            x: 0,
            y: 0,
            z: 0,
          },
          up: {
            x: 0,
            y: 1,
            z: 0,
          },
        },
      },
    };
  }

  #buildTrace(xData, yData, zData) {
    return {
      type: 'scatter3d',
      mode: 'lines',
      name: 'G-forces',
      hoverinfo: 'none',
      x: xData,
      y: yData,
      z: zData,
      line: {
        width: 5,
        color: 'red',
      }
    };
  }

  #buildMarker(xData, yData, zData) {
    return {
      x: [xData[0]],
      y: [yData[0]],
      z: [zData[0]],
      mode: 'markers',
      name: 'Video frame',
      hoverinfo: 'none',
      marker: {
        size: 7,
        color: 'blue',
      },
      type: 'scatter3d'
    };
  }
}