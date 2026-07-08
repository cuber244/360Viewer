# Insta360 360 Photo Viewer

Static 360 photo viewer for GitHub Pages.

## Files

- `index.html`
- `styles.css`
- `app.js`
- `.nojekyll`

`start-viewer.bat` is only a local Windows helper. It is not required for GitHub Pages.

## Deploy to GitHub Pages

1. Create a GitHub repository.
2. Upload these files to the repository root.
3. Open repository `Settings`.
4. Open `Pages`.
5. Set `Build and deployment` to `Deploy from a branch`.
6. Select the `main` branch and `/ (root)`.
7. Save.

The viewer will be available at:

```text
https://YOUR_NAME.github.io/REPOSITORY_NAME/
```

## Notes

- The selected photo is loaded locally in the browser.
- Photos are not uploaded to GitHub or any server.
- Use 2:1 equirectangular panorama photos for best results.
- Very large photos are resized in the browser for display.
