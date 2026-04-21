# Repository structure

This repo is now organized around a very simple static publishing workflow:

- `index.html` is the webpage.
- `content.csv` is the content source.
- `images/` holds the pictures used by the page.

## How to open the site

Because the page uses `fetch()` to load `content.csv`, it should be served over HTTP.

- GitHub Pages works.
- A local server like `python3 -m http.server` works.
- Opening `index.html` directly as a `file://` URL may not load the CSV correctly.

## How to update the site

1. Open `content.csv`.
2. Edit an existing row or add a new one.
3. Upload images into `images/<folder-name>/`.
4. Refresh the page.

## CSV columns

- `id`: unique row id.
- `slug`: HTML id for the section.
- `title`: card headline.
- `city`: city label.
- `country`: country label.
- `date`: visible date string.
- `lat`: map latitude.
- `lng`: map longitude.
- `summary`: short intro text.
- `story`: longer body copy. Multi-paragraph text is supported.
- `image_folder`: folder for numbered images like `images/amsterdam`.
- `image_count`: how many numbered images exist in that folder.
- `image_ext`: image extension for numbered files, like `jpg`, `jpeg`, or `png`.
- `images`: optional explicit image paths separated by `|`.
- `image_alt`: alt text for the gallery.
- `accent`: optional hex color like `#cf5c36`.

## Image options

You can use either image method:

### Option 1: Numbered folder images

Set:

- `image_folder=images/amsterdam`
- `image_count=3`
- `image_ext=jpg`

Then upload:

- `images/amsterdam/1.jpg`
- `images/amsterdam/2.jpg`
- `images/amsterdam/3.jpg`

### Option 2: Exact file paths

Leave `image_folder`, `image_count`, and `image_ext` blank and set:

- `images=images/amsterdam/cover.jpg|images/amsterdam/street.png`

This is useful when you do not want numbered filenames.

## Important note

Plain static HTML cannot automatically inspect a folder and discover new image filenames by itself. That is why the CSV needs either:

- a numbered image convention, or
- explicit image paths

Once the CSV matches the images you uploaded, the page updates automatically on refresh.
