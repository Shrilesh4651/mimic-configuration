document.addEventListener('DOMContentLoaded', () => {
  // ─── CORE ELEMENTS & VARIABLES ─────────────────────────────────────────────
  const svgCanvas = document.getElementById('canvas');
  const arrowModeBtn = document.getElementById('arrow-mode');
  const pencilModeBtn = document.getElementById('pencil-mode');
  const textModeBtn = document.getElementById('text-mode');
  const deleteModeBtn = document.getElementById('delete-mode');
  const customizeModeBtn = document.getElementById('customize-mode');
  const undoBtn = document.getElementById('undo');
  const redoBtn = document.getElementById('redo');
  const arrowTypeSelect = document.getElementById('arrow-type');
  const saveBtn = document.getElementById('save-btn');
  const loadBtn = document.getElementById('load-btn');
  const loadInput = document.getElementById('load-input');
  const setBgBtn = document.getElementById('set-bg-btn');
  const bgInput = document.getElementById('bg-input');
  const removeBgBtn = document.getElementById('remove-bg-btn');

  // Grid & background color buttons
  const colorGreyBtn = document.getElementById('color-grey');
  const colorWhiteBtn = document.getElementById('color-white');
  const colorBlackBtn = document.getElementById('color-black');

  // Component addition elements
  const addComponentBtn = document.getElementById('add-component');
  // We now add images to the sidebar element
  const sideBar = document.getElementById('sidebar');
  console.log("Sidebar element found:", sideBar);

  const GRID_SIZE = 10; // For snapping components to grid
  let gridColor = "gray"; // Default grid line color
  let bgColor = "white";  // Default background color

  // Unique component ID counter
  let componentIdCounter = 0;
  function getUniqueComponentId() {
    componentIdCounter++;
    return 'comp-' + componentIdCounter;
  }

  // Arrow tool settings
  let arrowType = arrowTypeSelect ? arrowTypeSelect.value : "single";
  arrowTypeSelect.addEventListener('change', (e) => { arrowType = e.target.value; });

  // Mode flags (only one active at a time)
  let arrowMode = false;
  let pencilMode = false;
  let textMode = false;
  let deleteMode = false;
  let customizeMode = false;
  let draggingConnectionPoint = null; // { componentId, pointIndex }

  // Background image (data URL)
  let backgroundImage = null;

  // State storage
  let components = [];
  let connections = [];
  let freeDrawings = [];
  let selectedComponents = []; // For multi-select/grouping

  // Arrow drawing state
  let drawingArrow = false;
  let currentConnection = null;
  let draggingPoint = null; // { connectionId, index, isBezier }

  // Mid‑handle dragging state (for blue mid‑handle)
  let draggingMid = null; // { connectionId, startX, startY, origC1, origC2 }

  // Component drag/resize state
  let draggingComponent = null; // { componentId, startX, startY, origX, origY, selectedOrigPositions }
  let resizingComponent = null; // { componentId, startX, startY, origWidth, origHeight }

  // Pencil drawing state
  let drawingPencil = false;
  let currentPencil = null;

  // Undo/Redo stacks
  let undoStack = [];
  let redoStack = [];

  // Store for connection DOM elements
  let connectionElements = {};

  // WebSocket (if needed)
  const ws = new WebSocket("ws://127.0.0.1:8000/ws");
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log("Received update:", data);
    const comp = components.find(c => c.id === data.id);
    if (comp && typeof data.isOn !== "undefined") {
      comp.isOn = data.isOn;
      redrawCanvas();
    }
  };

  // ─── HELPER FUNCTION: Compute point on cubic Bézier at parameter t ─────────────
  function computeBezierPoint(t, s, c1, c2, e) {
    const oneMinusT = 1 - t;
    const x = oneMinusT ** 3 * s.x + 3 * oneMinusT ** 2 * t * c1.x + 3 * oneMinusT * t ** 2 * c2.x + t ** 3 * e.x;
    const y = oneMinusT ** 3 * s.y + 3 * oneMinusT ** 2 * t * c1.y + 3 * oneMinusT * t ** 2 * c2.y + t ** 3 * e.y;
    return { x, y };
  }

  // ─── MODE MANAGEMENT ───────────────────────────────────────────────
  function setActiveMode(mode) {
    arrowMode = pencilMode = textMode = deleteMode = customizeMode = false;
    arrowModeBtn.classList.remove('active');
    pencilModeBtn.classList.remove('active');
    textModeBtn.classList.remove('active');
    deleteModeBtn.classList.remove('active');
    customizeModeBtn.classList.remove('active');

    arrowModeBtn.textContent = "Arrow Mode";
    pencilModeBtn.textContent = "Pencil Mode";
    textModeBtn.textContent = "Text Mode";
    deleteModeBtn.textContent = "Delete Mode";
    customizeModeBtn.textContent = "Customize Dots";

    if (mode) {
      if (mode === 'arrow') {
        arrowMode = true;
        arrowModeBtn.classList.add('active');
        arrowModeBtn.textContent = "Exit Arrow Mode";
      } else if (mode === 'pencil') {
        pencilMode = true;
        pencilModeBtn.classList.add('active');
        pencilModeBtn.textContent = "Exit Pencil Mode";
      } else if (mode === 'text') {
        textMode = true;
        textModeBtn.classList.add('active');
        textModeBtn.textContent = "Exit Text Mode";
      } else if (mode === 'delete') {
        deleteMode = true;
        deleteModeBtn.classList.add('active');
        deleteModeBtn.textContent = "Exit Delete Mode";
      } else if (mode === 'customize') {
        customizeMode = true;
        customizeModeBtn.classList.add('active');
        customizeModeBtn.textContent = "Exit Customize Dots";
      }
    }
  }

  arrowModeBtn.addEventListener('click', () => { arrowMode ? setActiveMode(null) : setActiveMode('arrow'); });
  pencilModeBtn.addEventListener('click', () => { pencilMode ? setActiveMode(null) : setActiveMode('pencil'); });
  textModeBtn.addEventListener('click', () => { textMode ? setActiveMode(null) : setActiveMode('text'); });
  deleteModeBtn.addEventListener('click', () => { deleteMode ? setActiveMode(null) : setActiveMode('delete'); });
  customizeModeBtn.addEventListener('click', () => { customizeMode ? setActiveMode(null) : setActiveMode('customize'); });

  // ─── BACKGROUND IMAGE HANDLERS ─────────────────────────────────────
  setBgBtn.addEventListener('click', () => { bgInput.click(); });
  bgInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      backgroundImage = event.target.result;
      redrawCanvas();
      saveState();
      broadcastState();
    };
    reader.readAsDataURL(file);
  });
  removeBgBtn.addEventListener('click', () => {
    backgroundImage = null;
    redrawCanvas();
    saveState();
    broadcastState();
  });

  // ─── STATE MANAGEMENT ──────────────────────────────────────────────
  function saveState() {
    const state = {
      components: JSON.parse(JSON.stringify(components)),
      connections: JSON.parse(JSON.stringify(connections)),
      freeDrawings: JSON.parse(JSON.stringify(freeDrawings)),
      backgroundImage: backgroundImage,
      gridColor: gridColor,
      bgColor: bgColor
    };
    undoStack.push(state);
    redoStack = [];
  }

  undoBtn.addEventListener('click', () => {
    if (undoStack.length > 0) {
      const lastState = undoStack.pop();
      redoStack.push({
        components: JSON.parse(JSON.stringify(components)),
        connections: JSON.parse(JSON.stringify(connections)),
        freeDrawings: JSON.parse(JSON.stringify(freeDrawings)),
        backgroundImage: backgroundImage,
        gridColor: gridColor,
        bgColor: bgColor
      });
      components = lastState.components;
      connections = lastState.connections;
      freeDrawings = lastState.freeDrawings;
      backgroundImage = lastState.backgroundImage;
      gridColor = lastState.gridColor || gridColor;
      bgColor = lastState.bgColor || bgColor;
      redrawCanvas();
      broadcastState();
    }
  });

  redoBtn.addEventListener('click', () => {
    if (redoStack.length > 0) {
      const nextState = redoStack.pop();
      undoStack.push({
        components: JSON.parse(JSON.stringify(components)),
        connections: JSON.parse(JSON.stringify(connections)),
        freeDrawings: JSON.parse(JSON.stringify(freeDrawings)),
        backgroundImage: backgroundImage,
        gridColor: gridColor,
        bgColor: bgColor
      });
      components = nextState.components;
      connections = nextState.connections;
      freeDrawings = nextState.freeDrawings;
      backgroundImage = nextState.backgroundImage;
      gridColor = nextState.gridColor || gridColor;
      bgColor = nextState.bgColor || bgColor;
      redrawCanvas();
      broadcastState();
    }
  });

  saveBtn.addEventListener('click', () => { saveStateToFile(); });
  loadBtn.addEventListener('click', () => { loadInput.click(); });
  loadInput.addEventListener('change', (e) => { loadStateFromFile(e); });

  function saveStateToFile() {
    const state = { components, connections, freeDrawings, backgroundImage, gridColor, bgColor };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
    const a = document.createElement('a');
    a.setAttribute("href", dataStr);
    a.setAttribute("download", "diagram_state.json");
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function loadStateFromFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const state = JSON.parse(event.target.result);
        components = state.components || [];
        connections = state.connections || [];
        freeDrawings = state.freeDrawings || [];
        backgroundImage = state.backgroundImage || null;
        gridColor = state.gridColor || gridColor;
        bgColor = state.bgColor || bgColor;
        redrawCanvas();
        broadcastState();
      } catch (err) {
        console.error("Error parsing JSON", err);
      }
    };
    reader.readAsText(file);
  }

  // ─── COMPONENT HANDLING ────────────────────────────────────────────
  const compElements = document.querySelectorAll('.component');
  compElements.forEach((elem) => {
    elem.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('component-type', elem.getAttribute('data-type'));
      const fixedId = elem.getAttribute('data-id') || "";
      e.dataTransfer.setData('component-id', fixedId);
    });
  });

  svgCanvas.addEventListener('dragover', (e) => { e.preventDefault(); });
  svgCanvas.addEventListener('drop', (e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('component-type');
    const fixedId = e.dataTransfer.getData('component-id');
    const pt = svgCanvas.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svgCanvas.getScreenCTM().inverse());
    addComponent(type, svgP.x, svgP.y, fixedId);
    saveState();
    broadcastState();
  });

  svgCanvas.addEventListener('mousedown', (e) => {
    if (pencilMode && (e.target === svgCanvas || e.target.tagName.toLowerCase() === 'rect')) {
      drawingPencil = true;
      currentPencil = { id: 'pencil-' + Date.now(), points: [] };
      const pt = svgCanvas.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgP = pt.matrixTransform(svgCanvas.getScreenCTM().inverse());
      currentPencil.points.push({ x: svgP.x, y: svgP.y });
    }
  });

  function redDotMouseDown(e, component, pointIndex) {
    if (customizeMode) {
      e.stopPropagation();
      draggingConnectionPoint = { componentId: component.id, pointIndex };
    }
  }

  function addComponent(type, x, y, fixedId = "") {
    const snappedX = Math.round(x / GRID_SIZE) * GRID_SIZE;
    const snappedY = Math.round(y / GRID_SIZE) * GRID_SIZE;
    const id = fixedId !== "" ? fixedId : getUniqueComponentId();
    let component;
    if (type === 'hline') {
      component = { 
        id, 
        x: snappedX, 
        y: snappedY, 
        width: 100, 
        height: 2, 
        type: 'hline',
        rotation: 0,
        connectionPoints: [{ x: 0, y: 0 }, { x: 1, y: 0 }] 
      };
    } else if (type === 'vline') {
      component = { 
        id, 
        x: snappedX, 
        y: snappedY, 
        width: 2, 
        height: 100, 
        type: 'vline',
        rotation: 0,
        connectionPoints: [{ x: 0, y: 0 }, { x: 0, y: 1 }] 
      };
    } else {
      component = { 
        id, 
        x: snappedX, 
        y: snappedY, 
        width: 50, 
        height: 50, 
        text: "", 
        type,
        rotation: 0
      };
      if (/\_OFF\.png$/i.test(type)) {
        component.typeOff = type;
        component.typeOn = type.replace(/_OFF\.png$/i, "_ON.png");
        component.isOn = false;
      } else if (/\_ON\.png$/i.test(type)) {
        component.typeOff = type.replace(/_ON\.png$/i, "_OFF.png");
        component.typeOn = type;
        component.isOn = true;
      }
      component.connectionPoints = [
        { x: 0.5, y: 0 },   // top-center
        { x: 0, y: 0.5 },   // left-center
        { x: 1, y: 0.5 },   // right-center
        { x: 0.5, y: 1 }    // bottom-center
      ];
    }
    components.push(component);
    drawComponent(component);
  }

  function drawComponent(component) {
    const ns = "http://www.w3.org/2000/svg";
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('id', component.id);
    g.setAttribute('transform', `translate(${component.x}, ${component.y}) rotate(${component.rotation || 0})`);
    g.style.cursor = "move";

    // Show/hide connection dots and bounding box on hover
    g.addEventListener('mouseenter', () => {
      const dots = g.querySelectorAll('.connection-point');
      dots.forEach(dot => dot.setAttribute('opacity', '1'));
      const bbox = g.querySelector('.component-bbox');
      if(bbox) bbox.setAttribute('opacity', '1');
    });
    g.addEventListener('mouseleave', () => {
      const dots = g.querySelectorAll('.connection-point');
      dots.forEach(dot => dot.setAttribute('opacity', '0'));
      const bbox = g.querySelector('.component-bbox');
      if(bbox) bbox.setAttribute('opacity', '0');
    });

    g.addEventListener('click', (e) => {
      if (deleteMode) { 
        deleteComponent(component.id); 
        e.stopPropagation(); 
      }
    });
    g.addEventListener('mousedown', (e) => {
      if (e.ctrlKey) {
        const index = selectedComponents.indexOf(component.id);
        if (index === -1) {
          selectedComponents.push(component.id);
          g.classList.add('selected');
        } else {
          selectedComponents.splice(index, 1);
          g.classList.remove('selected');
        }
      } else if (!arrowMode && !pencilMode && !textMode && !deleteMode && !customizeMode) {
        draggingComponent = {
          componentId: component.id,
          startX: e.clientX,
          startY: e.clientY,
          origX: component.x,
          origY: component.y
        };
        if (selectedComponents.length > 1 && selectedComponents.includes(component.id)) {
          draggingComponent.selectedOrigPositions = selectedComponents.map(id => {
            const c = components.find(comp => comp.id === id);
            return { id, origX: c.x, origY: c.y };
          });
        }
      }
    });

    g.addEventListener('dblclick', (e) => {
      if (e.shiftKey) {
        component.rotation = (component.rotation || 0) + 90;
        g.setAttribute('transform', `translate(${component.x}, ${component.y}) rotate(${component.rotation})`);
        updateConnectionsForComponent(component.id);
        saveState();
        broadcastState();
      } else if (textMode) {
        attachTextToComponent(component);
        e.stopPropagation();
      }
    });

    let src;
    if (component.typeOff && component.typeOn) {
      src = component.isOn ? `assets/${component.typeOn}` : `assets/${component.typeOff}`;
    } else if (/^(http|data:)/i.test(component.type)) {
      src = component.type;
    } else if (/\.(jpg|jpeg|png|gif|bmp)$/i.test(component.type)) {
      src = `assets/${component.type}`;
    } else if (component.type) {
      src = `assets/${component.type}.svg`;
    }

    if (component.type === 'hline') {
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', '0');
      line.setAttribute('y1', '0');
      line.setAttribute('x2', component.width);
      line.setAttribute('y2', '0');
      line.setAttribute('stroke', 'black');
      line.setAttribute('stroke-width', '2');
      g.appendChild(line);
    } else if (component.type === 'vline') {
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', '0');
      line.setAttribute('y1', '0');
      line.setAttribute('x2', '0');
      line.setAttribute('y2', component.height);
      line.setAttribute('stroke', 'black');
      line.setAttribute('stroke-width', '2');
      g.appendChild(line);
    } else {
      const img = document.createElementNS(ns, 'image');
      img.setAttributeNS(null, 'href', src);
      img.setAttribute('width', component.width);
      img.setAttribute('height', component.height);
      // Add error event to log if the image fails to load.
      img.addEventListener('error', (err) => {
        console.error("Image load error for component", component.id, "src:", src, err);
      });
      g.appendChild(img);

      if (component.typeOff && component.typeOn) {
        img.style.cursor = "pointer";
        img.addEventListener('click', (e) => {
          if (!arrowMode && !pencilMode && !textMode && !deleteMode && !customizeMode) {
            component.isOn = !component.isOn;
            redrawCanvas();
            saveState();
            broadcastState();
          }
        });
      }
    }

    // Create visible bounding box (dashed) – hidden by default (opacity 0)
    const bboxRect = document.createElementNS(ns, 'rect');
    bboxRect.setAttribute('class', 'component-bbox');
    bboxRect.setAttribute('x', 0);
    bboxRect.setAttribute('y', 0);
    bboxRect.setAttribute('width', component.width);
    bboxRect.setAttribute('height', component.height);
    bboxRect.setAttribute('fill', 'none');
    bboxRect.setAttribute('stroke', 'blue');
    bboxRect.setAttribute('stroke-dasharray', '4,2');
    bboxRect.setAttribute('opacity', '0');
    g.insertBefore(bboxRect, g.firstChild);

    // Create connection points (dots) – hidden by default (opacity 0)
    if (component.connectionPoints) {
      component.connectionPoints.forEach((pt, i) => {
        const circle = document.createElementNS(ns, 'circle');
        circle.setAttribute('class', 'connection-point');
        circle.setAttribute('cx', pt.x * component.width);
        circle.setAttribute('cy', pt.y * component.height);
        circle.setAttribute('r', '3');
        circle.setAttribute('opacity', '0');
        circle.addEventListener('mousedown', (e) => redDotMouseDown(e, component, i));
        circle.addEventListener('click', (e) => {
          e.stopPropagation();
          if (deleteMode) {
            component.connectionPoints.splice(i, 1);
            redrawCanvas();
            saveState();
            broadcastState();
            return;
          }
          if (!customizeMode) {
            handleConnectionPointClick(component.id, i);
          }
        });
        g.appendChild(circle);
      });
    }

    // Create resize handle
    const resizeHandle = document.createElementNS(ns, 'circle');
    resizeHandle.setAttribute('class', 'resize-handle');
    resizeHandle.setAttribute('cx', component.width);
    resizeHandle.setAttribute('cy', component.height);
    resizeHandle.setAttribute('r', '5');
    resizeHandle.setAttribute('fill', 'blue');
    resizeHandle.style.cursor = "nwse-resize";
    resizeHandle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      resizingComponent = {
        componentId: component.id,
        startX: e.clientX,
        startY: e.clientY,
        origWidth: component.width,
        origHeight: component.height
      };
    });
    g.appendChild(resizeHandle);

    svgCanvas.appendChild(g);

    if (component.text && component.text.trim() !== "") {
      attachTextToComponent(component);
    }
  }

  function attachTextToComponent(component) {
    const ns = "http://www.w3.org/2000/svg";
    let existing = document.getElementById(component.id + "-text");
    if (existing) return;
    const foreignObject = document.createElementNS(ns, 'foreignObject');
    foreignObject.setAttribute('id', component.id + "-text");
    foreignObject.setAttribute('x', 0);
    foreignObject.setAttribute('y', component.height + 5);
    foreignObject.setAttribute('width', component.width);
    foreignObject.setAttribute('height', 30);
    const div = document.createElement('div');
    div.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    div.setAttribute('contenteditable', 'true');
    div.style.boxSizing = "content-box";
    div.style.width = "100%";
    div.style.height = "100%";
    div.style.border = "transparent";
    div.style.background = "transparent";
    div.style.fontSize = "14px";
    div.style.padding = "0px";
    div.innerText = component.text || "Enter text...";
    div.addEventListener('input', () => {
      component.text = div.innerText;
      updateTextBoxWidth(div, foreignObject);
      saveState();
      broadcastState();
    });
    foreignObject.appendChild(div);
    const g = document.getElementById(component.id);
    g.appendChild(foreignObject);
  }

  function createTextMeasurer() {
    const span = document.createElement('span');
    span.style.visibility = 'hidden';
    span.style.whiteSpace = 'pre';
    span.style.position = 'absolute';
    span.style.top = '-9999px';
    document.body.appendChild(span);
    return span;
  }

  const textMeasurer = createTextMeasurer();

  function updateTextBoxWidth(div, foreignObject) {
    textMeasurer.style.fontSize = window.getComputedStyle(div).fontSize;
    textMeasurer.style.fontFamily = window.getComputedStyle(div).fontFamily;
    textMeasurer.style.padding = window.getComputedStyle(div).padding;
    textMeasurer.innerText = div.innerText || " ";
    const newWidth = Math.max(50, textMeasurer.getBoundingClientRect().width + 4);
    foreignObject.setAttribute('width', newWidth);
    div.style.width = newWidth + 'px';
  }

  // ─── MOUSE & DRAG/RESIZE EVENTS ─────────────────────────────────────────
  document.addEventListener('mousemove', (e) => {
    if (draggingComponent) {
      if (draggingComponent.selectedOrigPositions) {
        const dx = e.clientX - draggingComponent.startX;
        const dy = e.clientY - draggingComponent.startY;
        draggingComponent.selectedOrigPositions.forEach(pos => {
          const comp = components.find(c => c.id === pos.id);
          if (comp) {
            const newX = pos.origX + dx;
            const newY = pos.origY + dy;
            comp.x = Math.round(newX / GRID_SIZE) * GRID_SIZE;
            comp.y = Math.round(newY / GRID_SIZE) * GRID_SIZE;
            let g = document.getElementById(comp.id);
            if (g) { 
              g.setAttribute('transform', `translate(${comp.x}, ${comp.y}) rotate(${comp.rotation || 0})`); 
            }
            updateConnectionsForComponent(comp.id);
          }
        });
      } else {
        let comp = components.find(c => c.id === draggingComponent.componentId);
        if (comp) {
          const dx = e.clientX - draggingComponent.startX;
          const dy = e.clientY - draggingComponent.startY;
          const newX = draggingComponent.origX + dx;
          const newY = draggingComponent.origY + dy;
          comp.x = Math.round(newX / GRID_SIZE) * GRID_SIZE;
          comp.y = Math.round(newY / GRID_SIZE) * GRID_SIZE;
          let g = document.getElementById(comp.id);
          if (g) {
            g.setAttribute('transform', `translate(${comp.x}, ${comp.y}) rotate(${comp.rotation || 0})`);
          }
          updateConnectionsForComponent(comp.id);
        }
      }
    }
    if (resizingComponent) {
      let comp = components.find(c => c.id === resizingComponent.componentId);
      if (comp) {
        const dx = e.clientX - resizingComponent.startX;
        const dy = e.clientY - resizingComponent.startY;
        if (comp.type === 'hline') {
          comp.width = Math.max(10, resizingComponent.origWidth + dx);
          let g = document.getElementById(comp.id);
          let line = g.querySelector('line');
          if (line) { line.setAttribute('x2', comp.width); }
        } else if (comp.type === 'vline') {
          comp.height = Math.max(10, resizingComponent.origHeight + dy);
          let g = document.getElementById(comp.id);
          let line = g.querySelector('line');
          if (line) { line.setAttribute('y2', comp.height); }
        } else {
          comp.width = Math.max(20, resizingComponent.origWidth + dx);
          comp.height = Math.max(20, resizingComponent.origHeight + dy);
          let g = document.getElementById(comp.id);
          if (g) {
            let img = g.querySelector('image');
            if (img) {
              img.setAttribute('width', comp.width); 
              img.setAttribute('height', comp.height);
            }
            let handle = g.querySelector('.resize-handle');
            if (handle) { 
              handle.setAttribute('cx', comp.width); 
              handle.setAttribute('cy', comp.height); 
            }
            let textBox = document.getElementById(comp.id + "-text");
            if (textBox) { 
              textBox.setAttribute('width', comp.width); 
              textBox.setAttribute('y', comp.height + 5); 
            }
            let circles = g.querySelectorAll('.connection-point');
            circles.forEach((circle, i) => {
              const pt = comp.connectionPoints[i];
              circle.setAttribute('cx', pt.x * comp.width);
              circle.setAttribute('cy', pt.y * comp.height);
            });
          }
        }
        updateConnectionsForComponent(comp.id);
      }
    }
    if (draggingPoint) {
      let conn = connections.find(c => c.id === draggingPoint.connectionId);
      if (conn) {
        const pt = svgCanvas.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const svgP = pt.matrixTransform(svgCanvas.getScreenCTM().inverse());
        if (draggingPoint.isBezier) {
          if (draggingPoint.index === 1) {
            conn.bends[0].x = svgP.x;
            conn.bends[0].y = svgP.y;
          } else if (draggingPoint.index === 2) {
            conn.bends[1].x = svgP.x;
            conn.bends[1].y = svgP.y;
          }
          updateConnectionDrawing(conn);
        } else {
          if (draggingPoint.index === 0) {
            conn.start.x = svgP.x;
            conn.start.y = svgP.y;
          }
          else if (draggingPoint.index === conn.bends.length + 1) {
            conn.end.x = svgP.x;
            conn.end.y = svgP.y;
          }
          else {
            conn.bends[draggingPoint.index - 1].x = svgP.x;
            conn.bends[draggingPoint.index - 1].y = svgP.y;
          }
          updateConnectionDrawing(conn);
        }
      }
    }
    if (draggingMid) {
      let conn = connections.find(c => c.id === draggingMid.connectionId);
      if (conn) {
        const dx = e.clientX - draggingMid.startX;
        const dy = e.clientY - draggingMid.startY;
        conn.bends[0].x = draggingMid.origC1.x + dx;
        conn.bends[0].y = draggingMid.origC1.y + dy;
        conn.bends[1].x = draggingMid.origC2.x + dx;
        conn.bends[1].y = draggingMid.origC2.y + dy;
        updateConnectionDrawing(conn);
      }
    }
    if (pencilMode && drawingPencil && currentPencil) {
      const pt = svgCanvas.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgP = pt.matrixTransform(svgCanvas.getScreenCTM().inverse());
      currentPencil.points.push({ x: svgP.x, y: svgP.y });
      updatePencilDrawing(currentPencil);
    }
    if (customizeMode && draggingConnectionPoint) {
      let comp = components.find(c => c.id === draggingConnectionPoint.componentId);
      if (comp) {
        const pt = svgCanvas.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const svgP = pt.matrixTransform(svgCanvas.getScreenCTM().inverse());
        const relX = (svgP.x - comp.x) / comp.width;
        const relY = (svgP.y - comp.y) / comp.height;
        comp.connectionPoints[draggingConnectionPoint.pointIndex] = { x: relX, y: relY };
        let g = document.getElementById(comp.id);
        let circles = g.querySelectorAll('.connection-point');
        if (circles && circles.length > draggingConnectionPoint.pointIndex) {
          circles[draggingConnectionPoint.pointIndex].setAttribute('cx', relX * comp.width);
          circles[draggingConnectionPoint.pointIndex].setAttribute('cy', relY * comp.height);
        }
        updateConnectionsForComponent(comp.id);
      }
    }
  });

  document.addEventListener('mouseup', () => {
    if (draggingComponent) { draggingComponent = null; saveState(); broadcastState(); }
    if (resizingComponent) { resizingComponent = null; saveState(); broadcastState(); }
    if (draggingPoint) { draggingPoint = null; saveState(); broadcastState(); }
    if (draggingMid) { draggingMid = null; saveState(); broadcastState(); }
    if (pencilMode && drawingPencil) {
      drawingPencil = false;
      freeDrawings.push(currentPencil);
      drawPencil(currentPencil);
      currentPencil = null;
      saveState();
      broadcastState();
    }
    if (customizeMode && draggingConnectionPoint) { draggingConnectionPoint = null; saveState(); broadcastState(); }
  });

  svgCanvas.addEventListener('click', (e) => {
    if (arrowMode && drawingArrow && (e.target === svgCanvas || e.target.tagName.toLowerCase() === 'rect')) {
      const pt = svgCanvas.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgP = pt.matrixTransform(svgCanvas.getScreenCTM().inverse());
      if (currentConnection && currentConnection.type !== "bezier") {
        currentConnection.bends.push({ x: svgP.x, y: svgP.y });
        updateConnectionDrawing(currentConnection);
      }
    }
  });

  // ─── HELPER FUNCTIONS FOR ROUTING ─────────────────────────────────────────
  const CLEAR_MARGIN = 5;
  function lineIntersectsRect(x1, y1, x2, y2, comp, margin = 0) {
    const left   = comp.x - margin;
    const top    = comp.y - margin;
    const right  = comp.x + comp.width + margin;
    const bottom = comp.y + comp.height + margin;
    const lineLeft   = Math.min(x1, x2);
    const lineRight  = Math.max(x1, x2);
    const lineTop    = Math.min(y1, y2);
    const lineBottom = Math.max(y1, y2);
    if (lineRight < left || lineLeft > right || lineBottom < top || lineTop > bottom) {
      return false;
    }
    return true;
  }
  function verticalClear(x, y1, y2, obstacles, margin) {
    for (const obs of obstacles) {
      if (lineIntersectsRect(x, y1, x, y2, obs, margin)) return false;
    }
    return true;
  }
  function horizontalClear(x1, y, x2, obstacles, margin) {
    for (const obs of obstacles) {
      if (lineIntersectsRect(x1, y, x2, y, obs, margin)) return false;
    }
    return true;
  }
  function pointInsideRect(p, rect, margin = 0) {
    return p.x >= rect.x - margin && p.x <= rect.x + rect.width + margin &&
           p.y >= rect.y - margin && p.y <= rect.y + rect.height + margin;
  }
  function validCandidateRoute(route, srcRect, dstRect, margin) {
    for (let i = 1; i < route.length - 1; i++) {
      if (pointInsideRect(route[i], srcRect, margin) || pointInsideRect(route[i], dstRect, margin)) {
        return false;
      }
    }
    return true;
  }
  function routePolylineForConnection(connection, allComps) {
    const s = { x: connection.start.x, y: connection.start.y };
    const e = { x: connection.end.x, y: connection.end.y };
    const ignoreIDs = [connection.start.componentId, connection.end.componentId];
    const obstacles = allComps.filter(cmp => !ignoreIDs.includes(cmp.id));
    const srcRect = allComps.find(c => c.id === connection.start.componentId);
    const dstRect = allComps.find(c => c.id === connection.end.componentId);
    if (s.x === e.x || s.y === e.y) {
      if (s.y === e.y) {
        const candidateOffsets = [10,20,30,40,50,60,70,80,90,100,110,120];
        for (let offset of candidateOffsets) {
          for (let sign of [1, -1]) {
            let candidate = [ s, { x: s.x, y: s.y + sign * offset }, { x: e.x, y: s.y + sign * offset }, e ];
            if (verticalClear(s.x, s.y, s.y + sign * offset, obstacles, CLEAR_MARGIN) &&
                horizontalClear(s.x, s.y + sign * offset, e.x, obstacles, CLEAR_MARGIN) &&
                verticalClear(e.x, s.y + sign * offset, e.y, obstacles, CLEAR_MARGIN) &&
                (!srcRect || !dstRect || validCandidateRoute(candidate, srcRect, dstRect, CLEAR_MARGIN))) {
              return candidate;
            }
          }
        }
      }
      if (s.x === e.x) {
        const candidateOffsets = [10,20,30,40,50,60,70,80,90,100,110,120];
        for (let offset of candidateOffsets) {
          for (let sign of [1, -1]) {
            let candidate = [ s, { x: s.x + sign * offset, y: s.y }, { x: s.x + sign * offset, y: e.y }, e ];
            if (horizontalClear(s.x, s.y, s.x + sign * offset, obstacles, CLEAR_MARGIN) &&
                verticalClear(s.x + sign * offset, s.y, e.y, obstacles, CLEAR_MARGIN) &&
                horizontalClear(s.x + sign * offset, e.y, e.x, obstacles, CLEAR_MARGIN) &&
                (!srcRect || !dstRect || validCandidateRoute(candidate, srcRect, dstRect, CLEAR_MARGIN))) {
              return candidate;
            }
          }
        }
      }
    }
    // NEW CONDITION: When the second component is moved vertically upward (e.y < s.y)
    if (e.y < s.y) {
      // Option 1: Use an intermediate level based on the start's position.
      const candidateOffsets = [10,20,30,40,50,60,70,80,90,100,110,120];
      for (let offset of candidateOffsets) {
        let candidate = [
          s,
          { x: s.x, y: s.y - offset },
          { x: e.x, y: s.y - offset },
          e
        ];
        if (
          verticalClear(s.x, s.y, s.y - offset, obstacles, CLEAR_MARGIN) &&
          horizontalClear(s.x, s.y - offset, e.x, obstacles, CLEAR_MARGIN) &&
          verticalClear(e.x, s.y - offset, e.y, obstacles, CLEAR_MARGIN) &&
          (!srcRect || !dstRect || validCandidateRoute(candidate, srcRect, dstRect, CLEAR_MARGIN))
        ) {
          return candidate;
        }
      }
      // Option 2: Use an intermediate level based on the end's position.
      for (let offset of candidateOffsets) {
        let candidate = [
          s,
          { x: s.x, y: e.y - offset },
          { x: e.x, y: e.y - offset },
          e
        ];
        if (
          verticalClear(s.x, s.y, e.y - offset, obstacles, CLEAR_MARGIN) &&
          horizontalClear(s.x, e.y - offset, e.x, obstacles, CLEAR_MARGIN) &&
          verticalClear(e.x, e.y - offset, e.y, obstacles, CLEAR_MARGIN) &&
          (!srcRect || !dstRect || validCandidateRoute(candidate, srcRect, dstRect, CLEAR_MARGIN))
        ) {
          return candidate;
        }
      }
    }
    let candidate1 = [s, { x: s.x, y: e.y }, e];
    if (verticalClear(s.x, s.y, e.y, obstacles, CLEAR_MARGIN) &&
        horizontalClear(s.x, e.y, e.x, obstacles, CLEAR_MARGIN) &&
        (!srcRect || !dstRect || validCandidateRoute(candidate1, srcRect, dstRect, CLEAR_MARGIN))) {
      return candidate1;
    }
    let candidate2 = [s, { x: e.x, y: s.y }, e];
    if (horizontalClear(s.x, s.y, e.x, obstacles, CLEAR_MARGIN) &&
        verticalClear(e.x, s.y, e.y, obstacles, CLEAR_MARGIN) &&
        (!srcRect || !dstRect || validCandidateRoute(candidate2, srcRect, dstRect, CLEAR_MARGIN))) {
      return candidate2;
    }
    for (let offset of candidateOffsets) {
      for (let sign of [1, -1]) {
        const candX = s.x + sign * offset;
        let candidate = [s, { x: candX, y: s.y }, { x: candX, y: e.y }, e];
        if (horizontalClear(s.x, s.y, candX, obstacles, CLEAR_MARGIN) &&
            verticalClear(candX, s.y, e.y, obstacles, CLEAR_MARGIN) &&
            horizontalClear(candX, e.y, e.x, obstacles, CLEAR_MARGIN) &&
            (!srcRect || !dstRect || validCandidateRoute(candidate, srcRect, dstRect, CLEAR_MARGIN))) {
          return candidate;
        }
      }
    }
    for (let offset of candidateOffsets) {
      for (let sign of [1, -1]) {
        const candY = s.y + sign * offset;
        let candidate = [s, { x: s.x, y: candY }, { x: e.x, y: candY }, e];
        if (verticalClear(s.x, s.y, candY, obstacles, CLEAR_MARGIN) &&
            horizontalClear(s.x, candY, e.x, obstacles, CLEAR_MARGIN) &&
            verticalClear(e.x, candY, e.y, obstacles, CLEAR_MARGIN) &&
            (!srcRect || !dstRect || validCandidateRoute(candidate, srcRect, dstRect, CLEAR_MARGIN))) {
          return candidate;
        }
      }
    }
    return candidate2;
  }

  // ─── PENCIL HANDLING ───────────────────────────────────────────────
  function drawPencil(pencil) {
    const ns = "http://www.w3.org/2000/svg";
    const polyline = document.createElementNS(ns, 'polyline');
    polyline.setAttribute('id', pencil.id);
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', 'black');
    polyline.setAttribute('stroke-width', '2');
    const pointsStr = pencil.points.map(p => `${p.x},${p.y}`).join(' ');
    polyline.setAttribute('points', pointsStr);
    polyline.addEventListener('click', (e) => { 
      if (deleteMode) { 
        deleteFreeDrawing(pencil.id); 
        e.stopPropagation(); 
      } 
    });
    svgCanvas.appendChild(polyline);
  }

  function updatePencilDrawing(pencil) {
    const ns = "http://www.w3.org/2000/svg";
    let polyline = document.getElementById(pencil.id);
    if (!polyline) {
      polyline = document.createElementNS(ns, 'polyline');
      polyline.setAttribute('id', pencil.id);
      polyline.setAttribute('fill', 'none');
      polyline.setAttribute('stroke', 'black');
      polyline.setAttribute('stroke-width', '2');
      svgCanvas.appendChild(polyline);
    }
    const pointsStr = pencil.points.map(p => `${p.x},${p.y}`).join(' ');
    polyline.setAttribute('points', pointsStr);
  }

  // ─── DRAW CONNECTION ───────────────────────────────────────────────
  function drawConnection(connection) {
    const ns = "http://www.w3.org/2000/svg";
    if (connection.type === "bezier") {
      const g = document.createElementNS(ns, 'g');
      g.setAttribute('id', connection.id);
      g.addEventListener('click', (e) => { 
        if (deleteMode) { 
          deleteConnection(connection.id); 
          e.stopPropagation(); 
        } 
      });
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'black');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('marker-end', 'url(#arrowhead)');
      const s = connection.start;
      const c1 = connection.bends[0];
      const c2 = connection.bends[1];
      const e = connection.end;
      const d = `M ${s.x} ${s.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${e.x} ${e.y}`;
      path.setAttribute('d', d);
      g.appendChild(path);
      // Green control points (hidden by default)
      const controlCircles = [];
      [connection.bends[0], connection.bends[1]].forEach((p, idx) => {
        const circle = document.createElementNS(ns, 'circle');
        circle.setAttribute('class', 'control-point');
        circle.setAttribute('cx', p.x);
        circle.setAttribute('cy', p.y);
        circle.setAttribute('r', '5');
        circle.setAttribute('fill', 'green');
        circle.style.cursor = "pointer";
        circle.setAttribute('opacity', '0');
        circle.addEventListener('mousedown', (e) => { 
          e.stopPropagation(); 
          connection.customBezier = true;
          draggingPoint = { connectionId: connection.id, index: idx + 1, isBezier: true };
        });
        g.appendChild(circle);
        controlCircles.push(circle);
      });
      // Blue mid‑handle (hidden by default)
      const midPoint = computeBezierPoint(0.5, connection.start, connection.bends[0], connection.bends[1], connection.end);
      const midHandle = document.createElementNS(ns, 'circle');
      midHandle.setAttribute('class', 'mid-handle');
      midHandle.setAttribute('cx', midPoint.x);
      midHandle.setAttribute('cy', midPoint.y);
      midHandle.setAttribute('r', '5');
      midHandle.setAttribute('fill', 'blue');
      midHandle.style.cursor = "move";
      midHandle.setAttribute('opacity', '0');
      midHandle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        draggingMid = { 
          connectionId: connection.id, 
          startX: e.clientX, 
          startY: e.clientY, 
          origC1: { x: connection.bends[0].x, y: connection.bends[0].y },
          origC2: { x: connection.bends[1].x, y: connection.bends[1].y }
        };
      });
      g.appendChild(midHandle);
      
      // Make control dots and mid‑handle visible on hover over the connection.
      g.addEventListener('mouseenter', () => {
        controlCircles.forEach(circle => circle.setAttribute('opacity', '1'));
        midHandle.setAttribute('opacity', '1');
      });
      g.addEventListener('mouseleave', () => {
        controlCircles.forEach(circle => circle.setAttribute('opacity', '0'));
        midHandle.setAttribute('opacity', '0');
      });
      
      svgCanvas.appendChild(g);
      connectionElements[connection.id] = { group: g, path: path, controlCircles: controlCircles, midHandle: midHandle };
    } else {
      const g = document.createElementNS(ns, 'g');
      g.setAttribute('id', connection.id);
      g.addEventListener('click', (e) => { 
        if (deleteMode) { 
          deleteConnection(connection.id); 
          e.stopPropagation(); 
        } 
      });
      const polyline = document.createElementNS(ns, 'polyline');
      polyline.setAttribute('fill', 'none');
      polyline.setAttribute('stroke', 'black');
      polyline.setAttribute('stroke-width', '2');
      if (connection.type === "single") { 
        polyline.setAttribute('marker-end', 'url(#arrowhead)'); 
      } else if (connection.type === "double") {
        polyline.setAttribute('marker-start', 'url(#arrowhead)');
        polyline.setAttribute('marker-end', 'url(#arrowhead)');
      }
      const pointsArray = [connection.start, ...connection.bends, connection.end];
      const points = pointsArray.map((p) => `${p.x},${p.y}`).join(' ');
      polyline.setAttribute('points', points);
      g.appendChild(polyline);
      const controlCircles = [];
      pointsArray.forEach((p, index) => {
        const circle = document.createElementNS(ns, 'circle');
        circle.setAttribute('class', 'control-point');
        circle.setAttribute('cx', p.x);
        circle.setAttribute('cy', p.y);
        circle.setAttribute('r', '5');
        circle.setAttribute('fill', 'green');
        circle.style.cursor = "pointer";
        circle.setAttribute('opacity', '0');
        circle.addEventListener('mousedown', (e) => { 
          e.stopPropagation(); 
          draggingPoint = { connectionId: connection.id, index }; 
        });
        g.appendChild(circle);
        controlCircles.push(circle);
      });
      // Add hover events to show/hide the control circles.
      g.addEventListener('mouseenter', () => {
        controlCircles.forEach(circle => circle.setAttribute('opacity', '1'));
      });
      g.addEventListener('mouseleave', () => {
        controlCircles.forEach(circle => circle.setAttribute('opacity', '0'));
      });
      svgCanvas.appendChild(g);
      connectionElements[connection.id] = { group: g, polyline: polyline, controlCircles: controlCircles };
    }
  }

  function updateConnectionDrawing(connection) {
    if (connection.type === "bezier") {
      const elems = connectionElements[connection.id];
      if (!elems) return;
      const s = connection.start;
      const c1 = connection.bends[0];
      const c2 = connection.bends[1];
      const e = connection.end;
      const d = `M ${s.x} ${s.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${e.x} ${e.y}`;
      elems.path.setAttribute('d', d);
      [connection.bends[0], connection.bends[1]].forEach((p, idx) => {
        elems.controlCircles[idx].setAttribute('cx', p.x);
        elems.controlCircles[idx].setAttribute('cy', p.y);
      });
      const midPoint = computeBezierPoint(0.5, s, c1, c2, e);
      elems.midHandle.setAttribute('cx', midPoint.x);
      elems.midHandle.setAttribute('cy', midPoint.y);
    } else {
      const elems = connectionElements[connection.id];
      if (!elems) return;
      const pointsArray = [connection.start, ...connection.bends, connection.end];
      const points = pointsArray.map((p) => `${p.x},${p.y}`).join(' ');
      elems.polyline.setAttribute('points', points);
      elems.controlCircles.forEach((circle, index) => {
        circle.setAttribute('cx', pointsArray[index].x);
        circle.setAttribute('cy', pointsArray[index].y);
      });
    }
  }

  // ─── CANVAS RENDERING ──────────────────────────────────────────────
  function redrawCanvas() {
    while (svgCanvas.lastChild) { 
      svgCanvas.removeChild(svgCanvas.lastChild); 
    }
    const ns = "http://www.w3.org/2000/svg";
    const defs = document.createElementNS(ns, 'defs');
    defs.innerHTML = `
      <pattern id="smallGrid" width="${GRID_SIZE}" height="${GRID_SIZE}" patternUnits="userSpaceOnUse">
        <path d="M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}" fill="none" stroke="${gridColor}" stroke-width="0.5"/>
      </pattern>
      <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
        <rect width="100" height="100" fill="${bgColor}"/>
        <rect width="100" height="100" fill="url(#smallGrid)"/>
        <path d="M 100 0 L 0 0 0 100" fill="none" stroke="${gridColor}" stroke-width="1"/>
      </pattern>
      <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L0,6 L10,3 z" fill="black" />
      </marker>
    `;
    svgCanvas.appendChild(defs);
    if (backgroundImage) {
      const bgImg = document.createElementNS(ns, 'image');
      bgImg.setAttributeNS(null, 'href', backgroundImage);
      bgImg.setAttribute('x', '0');
      bgImg.setAttribute('y', '0');
      bgImg.setAttribute('width', '100%');
      bgImg.setAttribute('height', '100%');
      svgCanvas.appendChild(bgImg);
    }
    const rectEl = document.createElementNS(ns, 'rect');
    rectEl.setAttribute('width', '100%');
    rectEl.setAttribute('height', '100%');
    rectEl.setAttribute('fill', 'url(#grid)');
    svgCanvas.appendChild(rectEl);
    components.forEach(comp => drawComponent(comp));
    connections.forEach(conn => drawConnection(conn));
    freeDrawings.forEach(drawing => drawPencil(drawing));
  }

  function broadcastState() {
    const state = { components, connections, freeDrawings, backgroundImage, gridColor, bgColor };
    ws.send(JSON.stringify(state));
  }

  // ─── DELETION FUNCTIONS ─────────────────────────────────────────────
  function deleteComponent(compId) {
    components = components.filter(c => c.id !== compId);
    connections = connections.filter(conn => conn.start.componentId !== compId && conn.end.componentId !== compId);
    selectedComponents = selectedComponents.filter(id => id !== compId);
    redrawCanvas();
    saveState();
    broadcastState();
  }

  function deleteConnection(connId) {
    connections = connections.filter(conn => conn.id !== connId);
    redrawCanvas();
    saveState();
    broadcastState();
  }

  function deleteFreeDrawing(pencilId) {
    freeDrawings = freeDrawings.filter(p => p.id !== pencilId);
    redrawCanvas();
    saveState();
    broadcastState();
  }

  // ─── GRID & BG COLOR CHANGE FUNCTION ───────────────────────────────
  let arrowColor = "black";
  function changeGridAndBg(option) {
    if (option === "white") {
      bgColor = "white";
      gridColor = "#555";
      arrowColor = "black";
    } else if (option === "grey") {
      bgColor = "#ccc";
      gridColor = "white";
      arrowColor = "black";
    } else if (option === "black") {
      bgColor = "black";
      gridColor = "white";
      arrowColor = "white";
    }
    redrawCanvas();
    updateArrowColors();
    broadcastState();
  }

  function updateArrowColors() {
    document.querySelectorAll(".arrow").forEach(arrow => {
      arrow.style.stroke = arrowColor;
    });
  }

  if (colorWhiteBtn) colorWhiteBtn.addEventListener("click", () => changeGridAndBg("white"));
  if (colorGreyBtn) colorGreyBtn.addEventListener("click", () => changeGridAndBg("grey"));
  if (colorBlackBtn) colorBlackBtn.addEventListener("click", () => changeGridAndBg("black"));

  const bgColorSelect = document.getElementById("bg-color-select");
  if (bgColorSelect) {
    bgColorSelect.addEventListener("change", (event) => changeGridAndBg(event.target.value));
  }

  // ─── ADD NEW COMPONENT IMAGES ──────────────────────────────────────
  if (addComponentBtn) {
    const fileInput = document.getElementById('component-image-input');
    addComponentBtn.addEventListener('click', () => {
      fileInput.click();
    });
    fileInput.addEventListener('change', (e) => {
      console.log("File input changed.");
      const file = e.target.files[0];
      if (file) {
        console.log("File selected:", file.name);
        const reader = new FileReader();
        reader.onload = (event) => {
          const imageUrl = event.target.result;
          const imgElem = document.createElement('img');
          imgElem.src = imageUrl;
          imgElem.classList.add('component-item');
          imgElem.draggable = true;
          imgElem.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('component-type', imageUrl);
            e.dataTransfer.setData('component-id', '');
          });
          // Add error listener for debugging
          imgElem.addEventListener('error', (err) => {
            console.error("New component image failed to load:", err);
          });
          console.log("Appending new image to sidebar.");
          if (sideBar) {
            sideBar.appendChild(imgElem);
            console.log("Sidebar now contains:", sideBar.innerHTML);
          } else {
            console.error("Sidebar element not found!");
          }
        };
        reader.readAsDataURL(file);
      }
    });
  }
});
