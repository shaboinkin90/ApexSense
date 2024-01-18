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

  constructor(parameters) {
    this.#graphDivs = {
      'top': parameters['graphDivs'].top,
      'bottom': parameters['graphDivs'].bottom,
    };
    this.#videoPlayer = parameters['videoPlayer'];
    this.#syncCallback = parameters['syncCallback'];
  }

  prepareGraphs(parameters) {
    this.#fps = parameters['trace'].data.fps;
    this.#rawTrace = parameters['trace'].data.trace;

    if ('title' in parameters) {
      this.#title = parameters['title'];
    }

    const graphData = this.#processTraceData();
    if (parameters['view'] == '3d') {
      const mode = {
        'view': '3d',
      }
      this.#graph3d = this.#createPlot(mode, this.#graphDivs.top, graphData, this.#videoPlayer);
    }
    let mode = {
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

  viewGraph(view) {
    switch (view) {
      case '2d': {
        this.#graph3d.clear();
        this.#graphDivs.top.setAttribute('has-data', 'yes');
        this.#graphDivs.bottom.setAttribute('has-data', 'yes');
        this.#graph2dLateral.createPlotlyGraph(this.#title, this.#fps, this.#syncCallback);
        this.#graph2dHorizontal.createPlotlyGraph(this.#title, this.#fps, this.#syncCallback);
        return;
      }
      case '3d': {
        this.#graph2dLateral.clear();
        this.#graph2dHorizontal.clear();

        this.#graphDivs.top.setAttribute('has-data', 'yes');
        this.#graphDivs.bottom.setAttribute('has-data', 'no');
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

  clearGraphs() {
    if (this.#graph3d) {
      this.#graph3d.clear();
    }
    if (this.#graph2dHorizontal) {
      this.#graph2dHorizontal.clear();
    }
    if (this.#graph2dLateral) {
      this.#graph2dLateral.clear();
    }
    this.#graphDivs.top.setAttribute('has-data', 'no');
    this.#graphDivs.bottom.setAttribute('has-data', 'no');
  }

  #processTraceData() {
    const xVals = this.#rawTrace.map(point => point.x);
    const yVals = this.#rawTrace.map(point => point.y);
    const zVals = this.#rawTrace.map(point => point.z);

    if (xVals.length == 0 || yVals.length == 0 || zVals.length == 0) {
      console.log("Invalid trace data returned from processing");
      return;
    }

    // Normalize values to [-1, 1] due to opencv giving us pixel coordinates. 
    // Converting pixels to a g-force value requires more thought. See comment in processing/garmin_video_processing.py
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
  }

  createPlotlyGraph(title, fps, syncCallback) {
    throw new ("Extend PlotStrategy and implement updateGraph");
  }

  changeView(cameraOption) {
    throw new ("Extend PlotStrategy and implement changeView");
  }

  clear() {
    throw new ("Extend PlotStrategy and implement clear");
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

    this.videoPlayer.addEventListener('timeupdate', this.#updatePlotMarker);
  }

  changeView(cameraOption) {
    // no-op
  }

  clear() {
    Plotly.purge(this.plotlyDiv);
    this.plotlyDiv.removeAttribute('has-data');
    this.prevTime = 0;
    this.videoPlayer.removeEventListener('timeupdate', this.#updatePlotMarker);
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
        width: 5,
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

  createPlotlyGraph(title, fps, syncCallback) {
    this.fps = fps;
    const trace = this.#buildTrace(this.graphData.x, this.graphData.y, this.graphData.z);
    const marker = this.#buildMarker(this.graphData.x, this.graphData.y, this.graphData.z);
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
        console.log('plotly-click');
        const pointData = eventData.points[0];
        const videoFrame = pointData.z;
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

    this.videoPlayer.addEventListener('timeupdate', this.#updatePlotMarker);
  }

  changeView(position) {
    const cameraPosition = this.#getCameraPosition(position);
    Plotly.relayout(this.plotlyDiv, cameraPosition);
  }

  clear() {
    Plotly.purge(this.plotlyDiv);
    this.plotlyDiv.removeAttribute('has-data');
    this.prevTime = 0;
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
      console.log('updatePlotMarker no change');

      return;
    }

    const plotData = this.plotlyDiv.data;
    if (plotData.length == 0) {
      console.error(`${this.plotlyDiv.id} plotData has no data!`);
      return;
    }

    const frameNumber = Math.floor(this.videoPlayer.currentTime * this.fps);
    if (frameNumber < 0 || frameNumber >= plotData[0].z.length) {
      return;
    }

    // plotData[0] == trace, plotData[1] would be marker
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
              x: -2.5,
              y: 1.5,
              z: -5,
            },
            center: {
              x: 0,
              y: 0,
              z: 0,
            },
            up: {
              x: 0.15,
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