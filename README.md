# Cached Docker Build

This Github Action caches docker builds using the 
official [actions/cache](https://github.com/actions/toolkit/tree/main/packages/cache) library.


## Github Action Inputs

| Variable                         | Description                                                                 |
|----------------------------------|-----------------------------------------------------------------------------|
| `args`                           | ***Required*** Arguments passed to `docker build` command                   |
| `cache_key`                      | ***Required*** Key used for caching                                         |


## Example Usage

```
uses: mattes/cached-docker-build-action@v1
with:
  args: "--pull --file Dockerfile --tag my-image:tag ."
  cache_key: "${{ hashFiles('**/lockfiles') }}"
```

## Future work

  * Implement `expires` flag, blocked by [Clear cache #2](https://github.com/actions/cache/issues/2).

