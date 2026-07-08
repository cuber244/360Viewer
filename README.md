# Insta360 360 Photo Viewer

This is a simple browser viewer for 360 photos.

## What You Can Do

- Open a 360 photo in your browser
- Rotate the view by dragging or swiping
- Zoom with mouse wheel, pinch, or the viewer controls
- Use fullscreen mode
- Use phone gyroscope controls on supported smartphones
- Add the viewer to your phone home screen
- Correct tilted photos with roll and pitch offsets
- Reset the viewpoint at any time

## How To Use

1. Open the viewer page in your browser.
2. Tap or click `Select Photo`.
3. Choose a 360 photo from your device.
4. Drag or swipe the image to look around.
5. Use `Reset View` to return to the front view.

For the best result, use a 2:1 equirectangular 360 photo, such as an exported Insta360 photo.

## Using Gyroscope On iPhone Or Android

1. Open the viewer over HTTPS.
2. Select a photo.
3. Tap `Gyro`.
4. If your phone asks for motion/orientation permission, allow it.
5. Tilt or turn your phone to move the view.

You can still drag or swipe while gyroscope mode is on.

Note: Gyroscope mode requires HTTPS. It works on GitHub Pages. It does not work when opening the HTML file directly.

If `Gyro` does not respond on iPhone, check Safari's motion/orientation access setting and reload the page.

## Add To Home Screen

On iPhone:

1. Open the viewer in Safari.
2. Tap the share button.
3. Tap `Add to Home Screen`.
4. Open the viewer from the new home screen icon.

Pinch zoom remains available in the viewer.

## Correcting A Tilted Photo

If the whole photo looks tilted, use the correction controls.

- `Photo Roll`: rotate the panorama clockwise or counterclockwise
- `Photo Pitch`: tilt the panorama up or down
- `Reset Correction`: return both corrections to zero

## Buttons

- `Select Photo`: choose a 360 photo from your device
- `Demo`: load a sample panorama
- `Reset View`: return to the front view and default zoom
- `Gyro`: turn phone motion control on or off
- `Fullscreen`: open the viewer fullscreen
- `+`: choose another photo
- `Photo Roll`: correct sideways tilt in the photo
- `Photo Pitch`: correct up/down tilt in the photo
- `Reset Correction`: reset photo tilt correction

## Privacy

Selected photos stay inside your browser.

The viewer does not upload your photos to GitHub, a server, or any cloud storage.

## Large Photos

Very large photos may be resized inside the browser for smoother viewing. The original photo on your device is not changed.
