# 🔌 Relay Mimic Simulator

A web-based simulator for configuring and visualizing relay mimic diagrams. This project allows users to interactively simulate relay propagation, alternate paths, and latest statuses using a browser interface.

---

## 🗂 Project Structure

```
relay-mimic-simulator/
├── backend/
│   ├── main.py              # Flask/Django FastAPI app or main backend logic
│   └── __pycache__/         # Compiled Python cache
├── frontend/
│   ├── index.html           # Main HTML file
│   ├── styles.css           # UI styles
│   ├── script1.js           # Core simulation logic
│   ├── alternate.js         # Handles alternate relay path logic
│   ├── latests.js           # Displays the latest statuses
│   ├── propagate.js         # Propagation behavior simulation
│   └── assets/              # Icons, images, or other static assets
```

---

## ⚙️ Features

* 🔁 Relay propagation simulation
* 🔄 Alternate path configuration
* 🟢 Live mimic diagram rendering
* 📊 Real-time status update via JavaScript
* 🧩 Modular JS files for each function
* 📁 Static frontend served by backend
* 🖱️ Drag-Drop Images, Shapes, and Text (with Resize/Rotate)
* 🔍 Zooming Capability
* 🚨 Flashing Elements (e.g., alerts, alarms)
* 🎞️ Animation support
* 🔗 Connectors (Straight and Curve lines)
* 🎨 Canvas/SVG Background Color Setting
* 🖼️ Image Import Facility
* 🌐 Public-Subscriber Communication (via MQTT/WebSocket)

---

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/relay-mimic-simulator.git
cd relay-mimic-simulator
```

### 2. Run the Backend

If `main.py` is a Flask or FastAPI app:

```bash
cd backend
python main.py
```

The backend will start a local server (typically on `http://127.0.0.1:5000` or `8000`).

### 3. Open the Frontend

You can open the `index.html` file directly in a browser (for static testing), or serve it via the backend.

---

## 📦 Dependencies

### Backend

Make sure you have Python installed. Backend dependencies (if any) can be listed in a `requirements.txt`.

Install via:

```bash
pip install -r requirements.txt
```

### Frontend

This is a vanilla JS-based frontend—no frameworks or build tools required.

---


## 🛠 Future Enhancements

* API for saving and loading mimic configurations
* WebSocket support for real-time relay updates
* Admin panel for managing relays
* Dark mode UI

---

