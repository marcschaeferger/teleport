# benchfind

A CLI utility to discover modules with Benchmarks without compilation/linking. 


Example useage:

```sh
# Find all packages with benchmarks in the current dir:
benchfind
benchfind ./internal/...
benchfind --tags=integration,linux
benchfind --exclude github.com/gravitational/teleport/foo/bar
```