# Repository structure

This repo now supports four embeddable GitHub Pages views that can reference each other:

- `cities.html`: the map and city timeline page
- `connections.html`: the gallery of thematic connection cards
- `stories.html`: a visual story gallery backed by a CSV CMS
- `inspirations.html`: a zoomable poster wall with a slide-out inspiration drawer
- `data/cities.csv`: CMS data for map visits and city-level connection tags
- `data/connections.csv`: CMS data for the Connections gallery
- `data/stories.csv`: CMS data for the Stories gallery
- `data/inspirations.csv`: CMS data for the Inspirations poster wall
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
- `/stories.html`
- `/inspirations.html`

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
- `city_description`: optional city-level description shown on the card regardless of which visit is selected; the most recent non-empty value for a city wins
- `legal_protection`: optional 0-5 visit rating used in the city card average for legal protection
- `social_acceptance`: optional 0-5 visit rating used in the city card average for social acceptance
- `community_access`: optional 0-5 visit rating used in the city card average for community access
- `personal_belonging`: optional 0-5 visit rating used in the city card average for personal belonging
- `neighborhoods`: optional visit-level neighborhood names separated by `|`; combined uniquely on the city card
- `spaces`: optional visit-level space or gay bar names separated by `|`; combined uniquely on the city card
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

### `data/stories.csv`

Each row is one tile on the Stories page.

- `id`: stable story id
- `slug`: optional URL-friendly override for the hash anchor
- `title`: tile title
- `date`: optional story date in `YYYY-MM-DD`; used to sort stories newest first and display a formatted date on the card back
- `summary`: short teaser text shown on the gallery tile and modal
- `body`: longer story copy, multi-paragraph supported
- `size`: `square`, `landscape`, or `vertical`
- `city_tags`: one or more `city_key` values separated by `|`
- `connection_tags`: optional connection ids separated by `|`
- `image_folder`: optional folder for numbered images
- `image_count`: optional numbered image count
- `image_ext`: optional numbered image extension
- `images`: optional explicit image paths separated by `|`
- `image_alt`: alt text
- `accent`: optional hex color

`city_tags` should match `city_key` values from `data/cities.csv`. `connection_tags` should match `id` values from `data/connections.csv`.

### `data/inspirations.csv`

Each row is one poster on the Inspirations wall.

- `id`: stable inspiration id
- `slug`: optional URL-friendly override for the hash anchor
- `title`: poster title shown on the wall and in the drawer
- `creator`: author, host, director, or source name
- `type`: media type such as `Book`, `Film`, `Podcast`, or `Essay`
- `date`: optional `YYYY-MM-DD` date used in the drawer
- `display_date`: optional fallback label if you want custom text instead of a parsed date
- `summary`: short drawer intro
- `description`: longer body copy, multi-paragraph supported
- `city_tags`: one or more `city_key` values separated by `|`
- `connection_tags`: optional connection ids separated by `|`
- `story_tags`: optional story ids separated by `|`
- `image_folder`: optional folder for numbered poster images
- `image_count`: optional numbered image count
- `image_ext`: optional numbered image extension
- `images`: optional explicit image paths separated by `|`
- `image_alt`: alt text for the poster art
- `accent`: optional hex color used for placeholder styling
- `poster_center_x`: optional horizontal poster offset from the wall center in pixels; `0` means centered
- `poster_center_y`: optional vertical poster offset from the wall center in pixels; `0` means centered
- `poster_width`: optional poster width in pixels
- `poster_height`: optional poster height in pixels

`city_tags` should match `city_key` values from `data/cities.csv`. `connection_tags` should match `id` values from `data/connections.csv`. `story_tags` should match `id` values from `data/stories.csv`.

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

You can use either image method on `data/connections.csv` and `data/stories.csv`.

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

The same two image options also work on `data/inspirations.csv`. The brick wall background is generated in CSS, so you do not need a separate wall texture asset unless you want a custom photographed wall later.

## Important note

Plain static HTML cannot automatically inspect folders and discover new filenames by itself. The CSV needs either:

- a numbered image convention
- or explicit image paths

Once the CSV rows match the uploaded images, the pages update on refresh.
