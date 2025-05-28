import os
import json
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import threading
import webbrowser

app = FastAPI()

# Allow CORS for local testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Compute the absolute path to the frontend directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "..", "frontend")

# Serve static files from the frontend folder (access via /static)
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="frontend")

@app.get("/")
async def read_root():
    return {"message": "Welcome to the Relay Mimic Simulator API"}

# File to store the diagram state
DIAGRAM_FILE = os.path.join(BASE_DIR, "diagram.json")

def load_diagram():
    if os.path.exists(DIAGRAM_FILE):
        with open(DIAGRAM_FILE, "r") as f:
            return json.load(f)
    return {}

def save_diagram(data):
    with open(DIAGRAM_FILE, "w") as f:
        json.dump(data, f, indent=4)

@app.get("/diagram")
async def get_diagram():
    return load_diagram()

@app.post("/diagram")
async def update_diagram(data: dict):
    save_diagram(data)
    return {"status": "success"}

# Global flag to control simulation
simulation_active = False

# WebSocket connection manager for real-time updates
class ConnectionManager:
    def __init__(self):
        self.active_connections = []
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Broadcast received data to all connected clients
            await manager.broadcast(data)
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# Endpoint to start the simulation.
@app.get("/start_simulation")
async def start_simulation():
    global simulation_active
    simulation_active = True
    return {"status": "simulation started"}

# Background simulation task that periodically broadcasts data if simulation is active.
async def simulation_task():
    global simulation_active
    toggle = True
    while True:
        if simulation_active:
            # Example: broadcast a toggle update for a component with id "comp-123456"
            message = json.dumps({
                "id": "data-id=comp-sim1",
                "isOn": toggle
            })
            await manager.broadcast(message)
            toggle = not toggle
        await asyncio.sleep(5)

# Start the simulation task on startup.
@app.on_event("startup")
async def startup_event():
    asyncio.create_task(simulation_task())

if __name__ == "__main__":
    import uvicorn

    # Automatically open the index.html in the default web browser
    port = 5000  # Port on which the Flask app will run
    url = f"http://127.0.0.1:{8000}/static/index.html"
    threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
     