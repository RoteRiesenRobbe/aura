# Berryhunter

Repo for the most awesome berry-hunting experience.

## Running Locally on Windows with IntelliJ IDEA (2026 Edition)

This section describes how to run and debug the project natively on Windows using IntelliJ IDEA and a local Go installation — no WSL, no Docker required.

### Prerequisites

- **IntelliJ IDEA** with the Go plugin installed
- **Go** installed locally (e.g. to `C:\Program Files\Go`; verify with `go version`)
- **Node.js 20.12.2** and **npm 10.8.0** — anything higher *may* work but is untested.
  Using [nvm-windows](https://github.com/coreybutler/nvm-windows) is strongly recommended:
  ```
  nvm install 20.12.2
  nvm use 20.12.2
  ```

### One-time setup

1. **Configure the backend**
    1. Copy `backend/conf.local-windows.json` to `backend/conf.json` and adjust as needed.
    2. The most important value is `server.port` (defaults to `2000`) — this is the WebSocket port the backend listens on.
    3. The `game` section contains tuning parameters that are useful for testing (e.g. slower day/night cycles) but are optional.

2. **Create a token file**
    1. Create `backend/tokens.list` and add at least one token, e.g.:
       ```
       plz
       ```
       This token is passed in the game URL and required to run commands against the server from chat and URL bar.

3. **Install frontend dependencies** (first time only)
   Open a terminal in the `frontend/` directory and run:
   ```
   npm install
   ```

### Starting the project

Two IntelliJ run configurations are used — start them in order:

#### 1. Backend — `go build berryhunterd`

This compiles and runs the Go backend server.

- **Type:** Go Application
- **Package Path:** `github.com/trichner/berryhunter/cmd/berryhunterd`
- **Working directory:** `<project root>/backend`

Run it via **Run > Run 'go build berryhunterd'**, or use **Run > Debug** to attach IntelliJ's debugger. Breakpoints set in Go source files will be hit normally.

The backend starts on the port configured in `backend/conf.json` (default: `2000`).

#### 2. Frontend — `start client`

This starts the webpack dev server for the frontend.

- **Type:** npm
- **package.json:** `<project root>/frontend/package.json`
- **Command:** `run`
- **Script:** `start`


Run it via **Run > Run 'start client'**.

The dev server starts on port **2001** (defined in `frontend/webpack.dev.js`). It supports Hot Module Replacement, so frontend changes are reflected immediately without a full reload.

### Opening the game

Once both servers are running, open this URL in your browser:

```
http://localhost:2001/?token=plz&wsUrl=ws://localhost:2000/game
```

- `token=plz` — matches the token in `backend/tokens.list`
- `wsUrl=ws://localhost:2000/game` — points to the local backend WebSocket endpoint

#### Useful additions for development

The following query parameters are optional but helpful during development:

* `&develop`: Opens the draggable development panel in the frontend UI
* `&start-cmds=GOD,GIVE BronzeTool,GIVE IronSpear,GIVE Furnace 3,GIVE Berry 100`: Runs server-side commands on spawn, letting you skip the early game

To disable god mode during a run, type `#god off` into chat or the console (openable on Windows keyboards via the `^` key.)

A fully loaded dev URL (with god mode and a few starter items) looks like:

http://localhost:2001/?token=plz&start-cmds=GOD,GIVE%20BronzeTool,GIVE%20IronSpear,GIVE%20Furnace%203,GIVE%20Berry%20100&develop&wsUrl=ws://localhost:2000/game

### Debugging the backend in IntelliJ

1. Set breakpoints anywhere in the Go source code.
2. Use **Run > Debug 'go build berryhunterd'** instead of Run.
3. IntelliJ uses [Delve](https://github.com/go-delve/delve) under the hood — it is installed automatically by the Go plugin.
4. The frontend dev server runs independently and does not need to be restarted when the backend is restarted.

### Debugging the frontend

Use Chrome, the Developer Tools (opens with F12) and the Debugger.
Debugging in IntelliJ might be possible, but has not yet been tested.

---

## tl;dr

### Prerequisites
- install 
  - `make`
  - `go >1.22` ([instructions](https://go.dev/doc/install))
  - `docker` ([instructions](https://docs.docker.com/engine/install/ubuntu/#install-using-the-repository))
  - `node 20` (optional but useful; includes npm 10.5; usage of NVM recommended)

### Build
1. build the frontend
   ```
   # requires docker
   make -C frontend build
   ```
2. build the backend
   ```
   # requires go >1.22
   make -C backend build
   ```
3. boot the server
    ```
    cd backend
    ./berryhunterd -dev
    ```
4. check the console to figure out what URL to open in your local browser, probably http://localhost:2000/?wsUrl=ws://localhost:2000/game
5. profit!


## Running the Project

### Windows Environment

We use WSL (Windows Subsystem for Linux) which basically allows you to run Linux commands right on your Windows machine.

There is an [official guide](https://learn.microsoft.com/en-us/windows/wsl/install), but you can just use these commands to have everything in order:

1. Open Powershell as **administrator**
2. Run `Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform, Microsoft-Windows-Subsystem-Linux`
3. Reboot when prompted
4. `wsl --set-default-version 2`
5. `wsl --install -d Ubuntu-24.04`
6. As soon as the Powershell is done with the installation, it will open your new Ubuntu instance and asks you for a username and password.
    - Username can be anything but `root`, personally I like to use the same name as my windows username
    - Username needs to be all lowercase letters and or underscore (_) or dash (-)
    - Password doesn't need to be secure, you can easily repeat your username as password --> just remember it, as resetting it from outside is not possible
7. `sudo apt update && sudo apt upgrade` will install the latest system updates
8. Inside Ubuntu, run `explorer.exe .` --> this opens a regular Windows explorer window (at `\\wsl.localhost\Ubuntu-24.04\home\[username]\` ). If you are familiar with Unix you will notice how this path is a combination of a windows mounted "network" drive, your WSL distribution and finally the Unix filesystem.
9. Create a folder `workspaces` inside this Ubuntu home folder.
10. Checkout `berryhunter` here and open the project in your IDE
11. From here on you can follow the general/mac instructions
    - use `sudo -i` to become the root user for the rest of your session
    - `exit` ends your root session
    - Use `sudo apt install [software]` to install everything you need
    - To install go use `sudo snap install go --classic`

### Mac Environment
(Last updated 30.10.2018)

- open a terminal at project root
- run `make`. This will take a while when running first time (about 10 minutes)
- run `./up.sh` to load the images into docker and start docker
- game url: http://local.berryhunter.io:2015/?local

:V
