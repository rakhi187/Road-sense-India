# RoadSense India

Interactive route risk and ETA simulator for Indian roads.

## Run locally

Requires Node.js 24 and pnpm 11.

```sh
pnpm install
pnpm dev
```

The app opens on port 4173. Set `GOOGLE_MAPS_API_KEY` to enable live Google Routes estimates. Keep the key server-side; do not prefix it with `VITE_`.

## Build and run

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

The app listens on `0.0.0.0` and uses `PORT` when the host provides one (default: `4173`). `BASE_PATH` can set a subpath when needed (default: `/`). The Google Routes proxy runs with the app server, so deploy it as a Node service or container rather than as static files alone.

## Container deployment

Build and run the included image:

```sh
docker build -t roadsense-india .
docker run --rm -p 4173:4173 -e GOOGLE_MAPS_API_KEY=your-key roadsense-india
```

The host may map any external port to the container's port 4173. Set `PORT` if the container platform assigns a different internal port.
