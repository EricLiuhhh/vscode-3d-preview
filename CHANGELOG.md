# Change Log

All notable changes to the "vscode-3dpreview" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.
## v0.3.3
- clarify `.npy` as the primary occupancy entrypoint while keeping `.occ` compatibility
- update occupancy-related UI and loader error messages to reference NumPy-backed occupancy inputs
- move occupancy XY centering into the viewer and expose it as a GUI/config toggle
- keep occupancy label controls dynamic while rendering semantic labels as per-label voxel batches

## v0.3.2
- add `.npy` custom editor entry for NumPy-backed occupancy files
- prompt for `.npy` visualization type before loading
- keep OCC layer controls dynamic without hard-coded class counts

## v0.3.1
- add webview cache busting for media scripts and styles
- add OCC raw label visibility toggles in the viewer GUI

## v0.3.0
- add `.occ` occupancy visualization backed by NumPy `.npy` payloads
- render occupancy as instanced voxel cubes with optional scalar coloring
- add configurable occupancy voxel size via `3dpreview.occVoxelSize`

## v0.2.9
- add square/circle point shape toggle in GUI
- add configurable default point shape via `3dpreview.pointShape`

## v0.2.5
- fixed bug of rgb points in `.bin`

## v0.2.4
- support highlighting points for `.bin` files 

## v0.2.3
- support more choices for `.bin` files

## v0.2.2
- `*.bin` support.

## v0.2.1

- Add a new option to close control panel by default.

## v0.2.0

- FPS display.
- Automatic point size.
- Automatic positioning of gird/axis helpers.
- Automatic check whether `*.ply`, `*.obj`, and `*.off` files represent a mesh or a point cloud.
- Wireframe color change support.

## v0.1.0

- Initial release
