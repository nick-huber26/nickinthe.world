# Repository structure

This repo now supports two embeddable GitHub Pages views that can reference each other:

- `cities.html`: the map and city timeline page
- `connections.html`: the gallery of thematic connection cards
- `data/cities.csv`: CMS data for map visits and city-level connection tags
- `data/connections.csv`: CMS data for the Connections gallery
- `scripts/`: shared parsing logic plus page-specific behavior
- `styles/`: shared theme plus page-specific layouts
- `images/`: uploaded media used by either page

## How to open the site

Because both pages use `fetch()` to load CSV files, they should be served over HTTP.

- GitHub Pages works
- `python3 -m http.server` works locally
- opening the HTML directly as a `file://` URL may not load the CSVs correctly

## Pages and URLs

Once pushed to the GitHub Pages branch, the site exposes:

- `/cities.html`
- `/connections.html`

That means you can embed each page separately inside Google Sites by using its full GitHub Pages URL.

## CMS structure

### `data/cities.csv`

Each row is one visit on the map page.

- `id`: unique visit id
- `city_key`: stable reference id for a city, shared with `data/connections.csv`
- `title`: optional visit title
- `city`: city label
- `country`: country label
- `date`: `YYYY-MM-DD`
- `lat`: map latitude
- `lng`: map longitude
- `summary`: optional short visit summary
- `story`: optional long visit body copy, including multi-paragraph text
- `connection_tags`: optional connection ids separated by `|`
- `image_folder`: folder for numbered images like `images/amsterdam`
- `image_count`: number of numbered images in that folder
- `image_ext`: file extension for numbered images
- `images`: optional explicit image paths separated by `|`
- `image_alt`: alt text
- `accent`: optional hex color

### `data/connections.csv`

Each row is one gallery card on the Connections page.

- `id`: stable connection id
- `slug`: optional URL-friendly override for the hash anchor
- `title`: card title
- `summary`: short gallery summary
- `body`: expanded long-form body copy, multi-paragraph supported
- `topic_tags`: non-city chips separated by `|`
- `city_tags`: `city_key` values separated by `|`
- `image_folder`: optional folder for numbered images
- `image_count`: optional numbered image count
- `image_ext`: optional numbered image extension
- `images`: optional explicit image paths separated by `|`
- `image_alt`: alt text
- `accent`: optional hex color

The live Connections page can also read from a published Google Sheet with the same schema. Missing image-related columns are tolerated, but keeping the full header set makes the CMS easier to manage over time.

## Cross-page tagging

The cross-reference system works in both directions:

- add connection ids in `data/cities.csv -> connection_tags` to show related connection chips on a city visit
- add city keys in `data/connections.csv -> city_tags` to show related city chips on a connection card

The site merges both sources, so a relationship can be declared from either page's CMS.

Example:

- `city_key` in cities CSV: `amsterdam-netherlands`
- `id` in connections CSV: `global-queer-community`
- visit row `connection_tags`: `global-queer-community`
- connection row `city_tags`: `amsterdam-netherlands|seoul-south-korea`

For best results in the sheet:

- use stable connection ids like `global-queer-community`, not numeric row ids
- use `city_tags` values that match `city_key` values from the cities CMS, such as `chicago-usa`

## Image options

You can use either image method on both CSVs.

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

## Important note

Plain static HTML cannot automatically inspect folders and discover new filenames by itself. The CSV needs either:

- a numbered image convention
- or explicit image paths

Once the CSV rows match the uploaded images, the pages update on refresh.
