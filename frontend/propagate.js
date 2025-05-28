// propagate.js
// This file defines functions to propagate a component's on/off state 
// through its connections and update connection appearance accordingly.

function propagateState(componentId, visited = new Set()) {
  if (visited.has(componentId)) return;
  visited.add(componentId);
  
  // Look up the source component by id.
  const sourceComp = components.find(c => c.id === componentId);
  if (!sourceComp) return;
  
  // Iterate over all connections and, if this component is at one end,
  // update the connected component’s state.
  connections.forEach(conn => {
    // Propagate from source → target (one-way)
    if (conn.start.componentId === componentId) {
      const targetComp = components.find(c => c.id === conn.end.componentId);
      if (targetComp && typeof targetComp.isOn !== "undefined") {
        targetComp.isOn = sourceComp.isOn;
        updateConnectionAppearance(conn);
        propagateState(targetComp.id, visited);
      }
    }
    // Optionally, if you have a bidirectional (double) connection,
    // propagate the change in the reverse direction as well.
    if (conn.type === "double" && conn.end.componentId === componentId) {
      const targetComp = components.find(c => c.id === conn.start.componentId);
      if (targetComp && typeof targetComp.isOn !== "undefined") {
        targetComp.isOn = sourceComp.isOn;
        updateConnectionAppearance(conn);
        propagateState(targetComp.id, visited);
      }
    }
  });
}

function updateConnectionAppearance(connection) {
  // Choose a color based on the source component’s state.
  const sourceComp = components.find(c => c.id === connection.start.componentId);
  const newColor = sourceComp && sourceComp.isOn ? "green" : "red";
  if (connection.type === "bezier") {
    const elems = connectionElements[connection.id];
    if (elems && elems.path) {
      elems.path.setAttribute('stroke', newColor);
    }
  } else {
    const elems = connectionElements[connection.id];
    if (elems && elems.polyline) {
      elems.polyline.setAttribute('stroke', newColor);
    }
  }
}
