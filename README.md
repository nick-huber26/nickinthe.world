# Repository structure

This repo now supports four embeddable GitHub Pages views that can reference each other.

The public site is now wired to use published Google Sheet CSV tabs as the primary CMS source, with the local `data/*.csv` files kept in the repo as fallback backups.

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

## Live CMS Source

Each public page now loads data from the published Google Sheet tabs first, then falls back to the matching local CSV in `data/` if the remote fetch fails.

Primary live sources:

- `cities`: `https://docs.google.com/spreadsheets/d/e/2PACX-1vR3SXX_WeHF-GzeHKUdTHOnu69Nclo5YWhfZd7AvbRAe4tp63pcQqPk8768JdxQedf8Xvyj0OW-17vC/pub?gid=0&single=true&output=csv`
- `connections`: `https://docs.google.com/spreadsheets/d/e/2PACX-1vR3SXX_WeHF-GzeHKUdTHOnu69Nclo5YWhfZd7AvbRAe4tp63pcQqPk8768JdxQedf8Xvyj0OW-17vC/pub?gid=1903131448&single=true&output=csv`
- `stories`: `https://docs.google.com/spreadsheets/d/e/2PACX-1vR3SXX_WeHF-GzeHKUdTHOnu69Nclo5YWhfZd7AvbRAe4tp63pcQqPk8768JdxQedf8Xvyj0OW-17vC/pub?gid=1163359358&single=true&output=csv`
- `inspirations`: `https://docs.google.com/spreadsheets/d/e/2PACX-1vR3SXX_WeHF-GzeHKUdTHOnu69Nclo5YWhfZd7AvbRAe4tp63pcQqPk8768JdxQedf8Xvyj0OW-17vC/pub?gid=1604551648&single=true&output=csv`

That means content updates made through the Google Sheet or the Apps Script CMS tool can appear on the public site without pushing a new GitHub commit.

The local CSV files still matter because they:

- provide a fallback if a published sheet URL is unavailable
- give you a versioned snapshot in Git
- make it easy to restore or compare past content states

If you need to test a different source temporarily, each page still accepts URL overrides through query params such as:

- `citiesCsv`
- `connectionsCsv`
- `storiesCsv`
- `inspirationsCsv`

## CMS structure

Each CSV now follows the same broad pattern:

- identity first: `id`, then the page key (`slug` or `city_key`), then `title`
- primary content next: dates, summaries, and long-form copy
- relationship tags grouped together in a consistent order
- page-specific fields after that
- media fields at the end: `image_folder`, `image_count`, `image_ext`, `images`, `image_alt`, `accent`

That keeps the four CMS files easier to scan side-by-side while preserving the fields each page uniquely needs.

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
- `city_description`: optional city-level description shown on the card regardless of which visit is selected; the most recent non-empty value for a city wins
- `connection_tags`: optional connection ids separated by `|`
- `story_tags`: optional story ids separated by `|`
- `inspiration_tags`: optional inspiration ids separated by `|`
- `neighborhoods`: optional visit-level neighborhood names separated by `|`; combined uniquely on the city card
- `spaces`: optional visit-level space or gay bar names separated by `|`; combined uniquely on the city card
- `legal_protection`: optional 0-5 visit rating used in the city card average for legal protection
- `social_acceptance`: optional 0-5 visit rating used in the city card average for social acceptance
- `community_access`: optional 0-5 visit rating used in the city card average for community access
- `personal_belonging`: optional 0-5 visit rating used in the city card average for personal belonging
- `image_folder`: folder for numbered images like `images/amsterdam`
- `image_count`: number of numbered images in that folder
- `image_ext`: file extension for numbered images
- `images`: optional explicit image paths separated by `|`
- `image_alt`: alt text
- `accent`: optional hex color

The parser also accepts `body` as an alias for `story`, and `description` as an alias for `city_description`.

### `data/connections.csv`

Each row is one gallery card on the Connections page.

- `id`: stable connection id
- `slug`: optional URL-friendly override for the hash anchor
- `title`: card title
- `summary`: short gallery summary
- `body`: expanded long-form body copy, multi-paragraph supported
- `city_tags`: `city_key` values separated by `|`
- `story_tags`: optional story ids separated by `|`
- `inspiration_tags`: optional inspiration ids separated by `|`
- `topic_tags`: non-city chips separated by `|`
- `image_folder`: optional folder for numbered images
- `image_count`: optional numbered image count
- `image_ext`: optional numbered image extension
- `images`: optional explicit image paths separated by `|`
- `image_alt`: alt text
- `accent`: optional hex color

`city_tags` should match `city_key` values from `data/cities.csv`. `story_tags` should match `id` values from `data/stories.csv`. `inspiration_tags` should match `id` values from `data/inspirations.csv`.

### `data/stories.csv`

Each row is one tile on the Stories page.

- `id`: stable story id
- `slug`: optional URL-friendly override for the hash anchor
- `title`: tile title
- `date`: optional story date in `YYYY-MM-DD`; used to sort stories newest first and display a formatted date on the card back
- `summary`: short teaser text shown on the gallery tile and modal
- `body`: longer story copy, multi-paragraph supported
- `city_tags`: one or more `city_key` values separated by `|`
- `connection_tags`: optional connection ids separated by `|`
- `inspiration_tags`: optional inspiration ids separated by `|`
- `size`: `square`, `landscape`, or `vertical`
- `image_folder`: optional folder for numbered images
- `image_count`: optional numbered image count
- `image_ext`: optional numbered image extension
- `images`: optional explicit image paths separated by `|`
- `image_alt`: alt text
- `accent`: optional hex color

`city_tags` should match `city_key` values from `data/cities.csv`. `connection_tags` should match `id` values from `data/connections.csv`. `inspiration_tags` should match `id` values from `data/inspirations.csv`.

### `data/inspirations.csv`

Each row is one poster on the Inspirations wall.

- `id`: stable inspiration id
- `slug`: optional URL-friendly override for the hash anchor
- `title`: poster title shown on the wall and in the drawer
- `creator`: author, host, director, or source name
- `type`: media type such as `Book`, `Film`, `Podcast`, or `Essay`
- `date`: optional `YYYY-MM-DD` date used in the drawer
- `display_date`: optional fallback label if you want custom text instead of a parsed date
- `date_added`: optional date the inspiration was added to the wall or site
- `date_added_display`: optional custom added-date label
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

The parser also accepts `body` as an alias for `description`.

`city_tags` should match `city_key` values from `data/cities.csv`. `connection_tags` should match `id` values from `data/connections.csv`. `story_tags` should match `id` values from `data/stories.csv`.

## Cross-page tagging

The cross-reference system works in both directions across all four page types.

Each CSV can declare relationships to the other three:

- `data/cities.csv`: `connection_tags`, `story_tags`, `inspiration_tags`
- `data/connections.csv`: `city_tags`, `story_tags`, `inspiration_tags`
- `data/stories.csv`: `city_tags`, `connection_tags`, `inspiration_tags`
- `data/inspirations.csv`: `city_tags`, `connection_tags`, `story_tags`

The site merges both sources for every relationship, so a link can be declared from either side.

Example:

- `city_key` in cities CSV: `amsterdam-netherlands`
- `id` in connections CSV: `global-queer-community`
- visit row `connection_tags`: `global-queer-community`
- connection row `city_tags`: `amsterdam-netherlands|seoul-south-korea`

For best results in the sheet:

- use stable ids like `global-queer-community` or `gay-bar-why-we-went-out`, not numeric row ids
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
