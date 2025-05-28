document.addEventListener('DOMContentLoaded', () => {
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

  const GRID_SIZE = 10; // Grid size for snapping

  let arrowType = arrowTypeSelect ? arrowTypeSelect.value : "single";
  arrowTypeSelect.addEventListener('change', (e) => { arrowType = e.target.value; });

  // Mode flags (mutually exclusive)
  let arrowMode = false;
  let pencilMode = false;
  let textMode = false;
  let deleteMode = false;
  let customizeMode = false;
  let draggingConnectionPoint = null; // { componentId, pointIndex }

  // Background image for the canvas (as a data URL)
  let backgroundImage = null;

  // State variables
  let components = [];
  let connections = [];
  let freeDrawings = [];
  let selectedComponents = []; // For multi-select and grouping

  // For arrow drawing
  let drawingArrow = false;
  let currentConnection = null;
  let draggingPoint = null; // { connectionId, index }

  // For component dragging/resizing
  let draggingComponent = null; // { componentId, startX, startY, origX, origY, selectedOrigPositions }
  let resizingComponent = null; // { componentId, startX, startY, origWidth, origHeight }

  // For pencil (free-hand) drawing
  let drawingPencil = false;
  let currentPencil = null;

  // Undo/Redo stacks
  let undoStack = [];
  let redoStack = [];

  // Global store for drawn connection elements
  let connectionElements = {};

  // WebSocket for real-time updates
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

  // **Mode Management with Visual Feedback**
  function setActiveMode(mode) {
    arrowMode = false;
    pencilMode = false;
    textMode = false;
    deleteMode = false;
    customizeMode = false;

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

  arrowModeBtn.addEventListener('click', () => {
    if (arrowMode) setActiveMode(null);
    else setActiveMode('arrow');
  });
  pencilModeBtn.addEventListener('click', () => {
    if (pencilMode) setActiveMode(null);
    else setActiveMode('pencil');
  });
  textModeBtn.addEventListener('click', () => {
    if (textMode) setActiveMode(null);
    else setActiveMode('text');
  });
  deleteModeBtn.addEventListener('click', () => {
    if (deleteMode) setActiveMode(null);
    else setActiveMode('delete');
  });
  customizeModeBtn.addEventListener('click', () => {
    if (customizeMode) setActiveMode(null);
    else setActiveMode('customize');
  });

  // **Background Image Events**
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

  // **State Management**
  function saveState() {
    const state = {
      components: JSON.parse(JSON.stringify(components)),
      connections: JSON.parse(JSON.stringify(connections)),
      freeDrawings: JSON.parse(JSON.stringify(freeDrawings)),
      backgroundImage: backgroundImage
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
        backgroundImage: backgroundImage
      });
      components = lastState.components;
      connections = lastState.connections;
      freeDrawings = lastState.freeDrawings;
      backgroundImage = lastState.backgroundImage;
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
        backgroundImage: backgroundImage
      });
      components = nextState.components;
      connections = nextState.connections;
      freeDrawings = nextState.freeDrawings;
      backgroundImage = nextState.backgroundImage;
      redrawCanvas();
      broadcastState();
    }
  });

  saveBtn.addEventListener('click', () => { saveStateToFile(); });
  loadBtn.addEventListener('click', () => { loadInput.click(); });
  loadInput.addEventListener('change', (e) => { loadStateFromFile(e); });

  function saveStateToFile() {
    const state = { components, connections, freeDrawings, backgroundImage };
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
        redrawCanvas();
        broadcastState();
      } catch (err) {
        console.error("Error parsing JSON", err);
      }
    };
    reader.readAsText(file);
  }

  // **Component Handling**
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
    pt.x = e.clientX; pt.y = e.clientY;
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
      pt.x = e.clientX; pt.y = e.clientY;
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
    const id = fixedId !== "" ? fixedId : 'comp-' + Date.now();
    let component;
    if (type === 'hline') {
      component = { 
        id, 
        x: snappedX, 
        y: snappedY, 
        width: 100, 
        height: 2, 
        type: 'hline', 
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
        connectionPoints: [{ x: 0, y: 0 }, { x: 0, y: 1 }] 
      };
    } else {
      component = { id, x: snappedX, y: snappedY, width: 50, height: 50, text: "", type };
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
       // { x: 0, y: 0 },    // top-left
        { x: 0.5, y: 0 },  // top-center
      //  { x: 1, y: 0 },    // top-right
        { x: 0, y: 0.5 },  // left-center
        { x: 1, y: 0.5 },  // right-center
       // { x: 0, y: 1 },    // bottom-left
        { x: 0.5, y: 1 },  // bottom-center
       // { x: 1, y: 1 }     // bottom-right
      ];
    }
    components.push(component);
    drawComponent(component);
  }

  function drawComponent(component) {
    const ns = "http://www.w3.org/2000/svg";
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('id', component.id);
    g.setAttribute('transform', `translate(${component.x}, ${component.y})`);
    g.addEventListener('click', (e) => {
      if (deleteMode) { deleteComponent(component.id); e.stopPropagation(); }
    });
    g.style.cursor = "move";
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
      let src;
      if (component.typeOff && component.typeOn) {
        src = component.isOn ? `assets/${component.typeOn}` : `assets/${component.typeOff}`;
      } else if (/\.(jpg|jpeg|png|gif|bmp)$/i.test(component.type)) {
        src = `assets/${component.type}`;
      } else if (component.type) {
        src = `assets/${component.type}.svg`;
      }
      img.setAttributeNS(null, 'href', src);
      img.setAttribute('width', component.width);
      img.setAttribute('height', component.height);
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

    if (component.connectionPoints) {
      component.connectionPoints.forEach((pt, i) => {
        const circle = document.createElementNS(ns, 'circle');
        circle.setAttribute('class', 'connection-point');
        circle.setAttribute('cx', pt.x * (component.type === 'hline' ? component.width : component.width));
        circle.setAttribute('cy', pt.y * (component.type === 'vline' ? component.height : component.height));
        circle.setAttribute('r', '5');
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
    g.addEventListener('click', (e) => {
      if (textMode) { attachTextToComponent(component); }
    });
    svgCanvas.appendChild(g);
    if (component.text && component.text.trim() !== "") { attachTextToComponent(component); }
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
    span.style.position = 'absolute'; // Prevents layout shifts
    span.style.top = '-9999px'; // Moves it off-screen
    document.body.appendChild(span);
    return span;
}

const textMeasurer = createTextMeasurer(); // Reuse this element

function updateTextBoxWidth(div, foreignObject) {
    textMeasurer.style.fontSize = window.getComputedStyle(div).fontSize;
    textMeasurer.style.fontFamily = window.getComputedStyle(div).fontFamily;
    textMeasurer.style.padding = window.getComputedStyle(div).padding;
    textMeasurer.innerText = div.innerText || " ";

    const newWidth = Math.max(50, textMeasurer.getBoundingClientRect().width + 4);
    foreignObject.setAttribute('width', newWidth);
    div.style.width = newWidth + 'px';
}

// Attach event listener for real-time updates
function enableDynamicResizing(div, foreignObject) {
    div.addEventListener('input', () => updateTextBoxWidth(div, foreignObject));
}
  // **Mouse Events**
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
            comp.x = Math.round(newX / GRID_SIZE) * GRID_SIZE-1;
            comp.y = Math.round(newY / GRID_SIZE) * GRID_SIZE-1;
            let g = document.getElementById(comp.id);
            if (g) { g.setAttribute('transform', `translate(${comp.x}, ${comp.y})`); }
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
          if (g) { g.setAttribute('transform', `translate(${comp.x}, ${comp.y})`); }
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
            if (img) { img.setAttribute('width', comp.width); img.setAttribute('height', comp.height); }
            let handle = g.querySelector('.resize-handle');
            if (handle) { handle.setAttribute('cx', comp.width); handle.setAttribute('cy', comp.height); }
            let textBox = document.getElementById(comp.id + "-text");
            if (textBox) { textBox.setAttribute('width', comp.width); textBox.setAttribute('y', comp.height + 5); }
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
        pt.x = e.clientX; pt.y = e.clientY;
        const svgP = pt.matrixTransform(svgCanvas.getScreenCTM().inverse());
        if (draggingPoint.index === 0) { conn.start.x = svgP.x; conn.start.y = svgP.y; }
        else if (draggingPoint.index === conn.bends.length + 1) { conn.end.x = svgP.x; conn.end.y = svgP.y; }
        else { conn.bends[draggingPoint.index - 1].x = svgP.x; conn.bends[draggingPoint.index - 1].y = svgP.y; }
        updateConnectionDrawing(conn);
      }
    }
    if (pencilMode && drawingPencil && currentPencil) {
      const pt = svgCanvas.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const svgP = pt.matrixTransform(svgCanvas.getScreenCTM().inverse());
      currentPencil.points.push({ x: svgP.x, y: svgP.y });
      updatePencilDrawing(currentPencil);
    }
    if (customizeMode && draggingConnectionPoint) {
      let comp = components.find(c => c.id === draggingConnectionPoint.componentId);
      if (comp) {
        const pt = svgCanvas.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
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
      pt.x = e.clientX; pt.y = e.clientY;
      const svgP = pt.matrixTransform(svgCanvas.getScreenCTM().inverse());
      currentConnection.bends.push({ x: svgP.x, y: svgP.y });
      updateConnectionDrawing(currentConnection);
    }
  });

  // **Connection Handling**
  function handleConnectionPointClick(componentId, pointIndex) {
    if (!arrowMode) return;
    const component = components.find(c => c.id === componentId);
    if (!component) return;
    const pt = component.connectionPoints[pointIndex];
    if (!pt) return;
    const absX = component.x + pt.x * component.width;
    const absY = component.y + pt.y * component.height;
    if (!drawingArrow) {
      drawingArrow = true;
      currentConnection = {
        id: 'conn-' + Date.now(),
        start: { componentId, pointIndex, x: absX, y: absY },
        bends: [],
        end: null,
        type: arrowType
      };
    } else {
      currentConnection.end = { componentId, pointIndex, x: absX, y: absY };
      connections.push(currentConnection);                         
      drawConnection(currentConnection);
      drawingArrow = false;
      currentConnection = null; 
      saveState(); 
      broadcastState();
    }    redrawCanvas();
    
  }

  function updateConnectionsForComponent(compId) {
    const comp = components.find(c => c.id === compId);
    if (!comp) return;
    connections.forEach(conn => {
      if (conn.start.componentId === compId) {
        const pt = comp.connectionPoints[conn.start.pointIndex];
        conn.start.x = comp.x + pt.x * GRID_SIZE;
        conn.start.y = comp.y + pt.y * GRID_SIZE;
      }
      if (conn.end.componentId === compId) {
        const pt = comp.connectionPoints[conn.end.pointIndex];
        conn.end.x = comp.x + pt.x * GRID_SIZE;
        conn.end.y = comp.y + pt.y * GRID_SIZE;
      }
      updateConnectionDrawing(conn);
    });
  }

  function drawPencil(pencil) {
    const ns = "http://www.w3.org/2000/svg";
    const polyline = document.createElementNS(ns, 'polyline');
    polyline.setAttribute('id', pencil.id);
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', 'black');
    polyline.setAttribute('stroke-width', '2');
    const pointsStr = pencil.points.map(p => `${p.x},${p.y}`).join(' ');
    polyline.setAttribute('points', pointsStr);
    polyline.addEventListener('click', (e) => { if (deleteMode) { deleteFreeDrawing(pencil.id); e.stopPropagation(); } });
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

  function drawConnection(connection) {
    const ns = "http://www.w3.org/2000/svg";
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('id', connection.id);
    g.addEventListener('mousemove', (e) => { if (deleteMode) { deleteConnection(connection.id); e.stopPropagation(); } });
    const polyline = document.createElementNS(ns, 'polyline');
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', 'black');
    polyline.setAttribute('stroke-width', '2');
    if (connection.type === "single") { polyline.setAttribute('marker-end', 'url(#arrowhead)'); }
    else if (connection.type === "double") {
      polyline.setAttribute('marker-start', 'url(#arrowhead)');
      polyline.setAttribute('marker-end', 'url(#arrowhead)');
    }else if(connection.type==="curve"){}
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
      circle.addEventListener('mousedown', (e) => { e.stopPropagation(); draggingPoint = { connectionId: connection.id, index }; });
      g.appendChild(circle);
      controlCircles.push(circle);
    });
    svgCanvas.appendChild(g);
    connectionElements[connection.id] = { group: g, polyline, controlCircles };
  }

  function updateConnectionDrawing(connection) {
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

  // **Canvas Rendering**
  function redrawCanvas() {
    while (svgCanvas.lastChild) { svgCanvas.removeChild(svgCanvas.lastChild); }
    const ns = "http://www.w3.org/2000/svg";
    const defs = document.createElementNS(ns, 'defs');
    defs.innerHTML = `
      <pattern id="smallGrid" width="${GRID_SIZE}" height="${GRID_SIZE}" patternUnits="userSpaceOnUse">
        <path d="M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}" fill="none" stroke="gray" stroke-width="0.5"/>
      </pattern>
      <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
        <rect width="100" height="100" fill="url(#smallGrid)"/>
        <path d="M 100 0 L 0 0 0 100" fill="none" stroke="gray" stroke-width="1"/>
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
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('width', '100%');
    rect.setAttribute('height', '100%');
    rect.setAttribute('fill', 'url(#grid)');
    svgCanvas.appendChild(rect);
    components.forEach(comp => drawComponent(comp));
    connections.forEach(conn => drawConnection(conn));
    freeDrawings.forEach(drawing => drawPencil(drawing));
  }

  function broadcastState() {
    const state = { components, connections, freeDrawings, backgroundImage };
    ws.send(JSON.stringify(state));
  }

  // **Deletion Functions**
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
});
function drawCurvedConnection(startX, startY, endX, endY, connectionId) {
  const ns = "http://www.w3.org/2000/svg";
  let existingPath = document.getElementById(connectionId);
  
  if (!existingPath) {
      existingPath = document.createElementNS(ns, 'path');
      existingPath.setAttribute('id', connectionId);
      existingPath.setAttribute('stroke', 'black');
      existingPath.setAttribute('fill', 'transparent');
      existingPath.setAttribute('stroke-width', '2');
      svgCanvas.appendChild(existingPath);
  }

  // Calculate control points for smooth curve (adjust these for different curvatures)
  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;
  const controlX1 = midX;
  const controlY1 = startY;
  const controlX2 = midX;
  const controlY2 = endY;

  // Use cubic Bézier curve (C command)
  const pathData = `M ${startX} ${startY} C ${controlX1} ${controlY1}, ${controlX2} ${controlY2}, ${endX} ${endY}`;

  existingPath.setAttribute('d', pathData);
}


