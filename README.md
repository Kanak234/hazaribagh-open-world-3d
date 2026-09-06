# Hazaribagh Open World 3D

A browser-based 3D open-world game engine whose map is built from the real-world
street data of Hazaribagh, Jharkhand, India. Built with
[Three.js](https://threejs.org/) and [Vite](https://vitejs.dev/), written in
TypeScript.

## Run in development

```bash
npm install
npm run dev        # Vite dev server
```

## Build

```bash
npm run build      # production build
npm run preview    # preview the production build
```

## Map data

```bash
npm run fetch-osm  # pull the Hazaribagh street network from OpenStreetMap
```

The world geometry is generated from OpenStreetMap data for Hazaribagh, so the
road layout mirrors the actual city.

## Requires

- Node.js and npm
- Dependencies are installed by `npm install`. `fetch-osm` needs network access
  to query OpenStreetMap.

## Status

`tsc --noEmit` passes cleanly. This is a game-engine scaffold — the world loads
and renders; gameplay systems are a work in progress.
